const { CORS_HEADERS } = require("./_shared");
const { getSupabase, todayDate } = require("./_supabase");
const { sendSms } = require("./_sms");

const LOYALTY_EVERY = 5; // every 5th completed visit gets a reward message
const SURGE_QUEUE_THRESHOLD = 5; // queue length that triggers the surge fee
const SURGE_FEE_AMOUNT = 30;

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: CORS_HEADERS, body: "" };
  }
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: CORS_HEADERS, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  let data;
  try {
    data = JSON.parse(event.body || "{}");
  } catch {
    data = {};
  }

  const salonSlug = (data.salon || "").trim();
  const name = (data.name || "").trim();
  const phone = (data.phone || "").trim();
  // Backward compatible: accept either the old single service_id, or a new
  // service_ids array for the multi-service cart. Both keep working.
  const serviceIds = Array.isArray(data.service_ids) && data.service_ids.length
    ? data.service_ids
    : (data.service_id ? [data.service_id] : []);
  const productIds = Array.isArray(data.product_ids) ? data.product_ids : [];
  let staffId = (data.staff_id || "").trim();
  const bookingType = data.booking_type === "appointment" ? "appointment" : "walkin";
  const scheduledAt = (data.scheduled_at || "").trim();
  const channel = data.channel === "whatsapp" ? "whatsapp" : "sms";
  const isWalkinGuest = !!data.is_walkin_guest; // staff quick-add, no real phone

  if (!salonSlug || !name || (!phone && !isWalkinGuest) || !serviceIds.length) {
    return {
      statusCode: 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: "salon, name, phone and at least one service are required" }),
    };
  }
  if (bookingType === "appointment" && !scheduledAt) {
    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: "scheduled_at is required for appointments" }) };
  }

  // Staff quick-add walk-ins get a unique placeholder "phone" so they still
  // satisfy the not-null/uniqueness expectations elsewhere without needing
  // a real number.
  const effectivePhone = phone || `WALKIN-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  const supabase = getSupabase();

  const { data: salon, error: salonErr } = await supabase
    .from("salons")
    .select("id, name, address, upi_id, payment_qr_url, happy_hours_enabled, happy_hours_discount_percent, sms_mode")
    .eq("slug", salonSlug)
    .single();
  if (salonErr || !salon) {
    return { statusCode: 404, headers: CORS_HEADERS, body: JSON.stringify({ error: "Salon not found" }) };
  }

  const { data: services, error: serviceErr } = await supabase
    .from("services")
    .select("id, name, duration_minutes, price")
    .in("id", serviceIds)
    .eq("salon_id", salon.id);
  if (serviceErr || !services || services.length !== serviceIds.length) {
    return { statusCode: 404, headers: CORS_HEADERS, body: JSON.stringify({ error: "One or more services were not found" }) };
  }

  let products = [];
  if (productIds.length) {
    const { data: productRows, error: productErr } = await supabase
      .from("products")
      .select("id, name, price")
      .in("id", productIds)
      .eq("salon_id", salon.id);
    if (productErr) {
      return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: productErr.message }) };
    }
    products = productRows || [];
  }

  // The first selected service stays the "primary" service_id on the row,
  // so every existing feature (queue wait-time, analytics, loyalty, my
  // bookings) that reads a single service keeps working unchanged.
  const primaryService = services[0];
  const totalDurationMinutes = services.reduce((sum, s) => sum + s.duration_minutes, 0);

  // One active booking per phone number, per salon, at a time (skipped for
  // staff-added walk-in guests, who don't have a real phone to dedupe on).
  if (!isWalkinGuest) {
    const { data: existingActive } = await supabase
      .from("tokens")
      .select("id, status, booking_type, seq, scheduled_at")
      .eq("salon_id", salon.id)
      .eq("phone", effectivePhone)
      .in("status", ["waiting", "serving", "scheduled"])
      .maybeSingle();

    if (existingActive) {
      const what =
        existingActive.status === "scheduled"
          ? `an appointment booked for ${new Date(existingActive.scheduled_at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true })}`
          : `an active token (T${existingActive.seq}) in today's queue`;
      return {
        statusCode: 409,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: `You already have ${what} at this salon. Please complete or wait for that one before booking again.` }),
      };
    }
  }

  if (!staffId) {
    const { data: firstStaff } = await supabase
      .from("staff")
      .select("id")
      .eq("salon_id", salon.id)
      .eq("is_active", true)
      .order("name")
      .limit(1)
      .single();
    if (firstStaff) staffId = firstStaff.id;
  }

  const day = todayDate();

  // ---- Pricing: services + products, minus happy-hours discount ----
  const servicesTotal = services.reduce((sum, s) => sum + Number(s.price), 0);
  const productsTotal = products.reduce((sum, p) => sum + Number(p.price), 0);
  const subtotal = servicesTotal + productsTotal;

  // Happy hours: a flat off-peak discount, active Monday-Wednesday when the
  // salon has it enabled.
  const todayWeekday = new Date().getDay(); // 0=Sun..6=Sat
  const isHappyHoursDay = todayWeekday >= 1 && todayWeekday <= 3; // Mon-Wed
  const happyHoursActive = salon.happy_hours_enabled && isHappyHoursDay;
  const discountAmount = happyHoursActive ? Math.round(subtotal * (Number(salon.happy_hours_discount_percent) / 100)) : 0;

  const cartItems = [
    ...services.map((s) => ({ type: "service", id: s.id, name: s.name, price: s.price, duration_minutes: s.duration_minutes })),
    ...products.map((p) => ({ type: "product", id: p.id, name: p.name, price: p.price })),
  ];

  // ---------- Appointment booking ----------
  if (bookingType === "appointment") {
    if (staffId) {
      const { data: conflict } = await supabase
        .from("tokens")
        .select("id")
        .eq("staff_id", staffId)
        .eq("scheduled_at", scheduledAt)
        .eq("status", "scheduled")
        .maybeSingle();
      if (conflict) {
        return {
          statusCode: 409,
          headers: CORS_HEADERS,
          body: JSON.stringify({ error: "That time slot with this barber was just taken — please pick another time." }),
        };
      }
    }

    const totalAmount = subtotal - discountAmount; // no surge fee for pre-booked appointments
    const paymentNeeded = !!(salon.upi_id || salon.payment_qr_url);

    const { data: inserted, error: insertErr } = await supabase
      .from("tokens")
      .insert({
        salon_id: salon.id,
        day,
        seq: 0,
        name,
        phone: effectivePhone,
        service_id: primaryService.id,
        staff_id: staffId || null,
        status: "scheduled",
        booking_type: "appointment",
        scheduled_at: scheduledAt,
        payment_status: paymentNeeded ? "pending" : "not_required",
        cart_items: cartItems,
        total_amount: totalAmount,
        discount_amount: discountAmount,
        channel_preference: channel,
      })
      .select("id")
      .single();

    if (insertErr) {
      return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: insertErr.message }) };
    }

    const when = new Date(scheduledAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true });
    const serviceNames = services.map((s) => s.name).join(", ");
    const confirmMsg = `${salon.name}: Your appointment for ${serviceNames} at ${when} is booked${discountAmount ? ` (₹${discountAmount} happy-hours discount applied)` : ""}. See you then!`;

    if (channel === "sms" && salon.sms_mode !== "mock" && !isWalkinGuest) {
      await sendSms(effectivePhone, confirmMsg, salon.id);
    }

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        booking_type: "appointment",
        booking_id: inserted.id,
        scheduled_at: scheduledAt,
        service: serviceNames,
        amount: totalAmount,
        cart_items: cartItems,
        discount_amount: discountAmount,
        payment_needed: paymentNeeded,
        upi_id: salon.upi_id || null,
        payment_qr_url: salon.payment_qr_url || null,
        salon_name: salon.name,
        salon_address: salon.address,
        channel,
        whatsapp_message: confirmMsg,
      }),
    };
  }

  // ---------- Walk-in booking ----------
  const { data: maxRow } = await supabase
    .from("tokens")
    .select("seq")
    .eq("salon_id", salon.id)
    .eq("staff_id", staffId)
    .eq("day", day)
    .order("seq", { ascending: false })
    .limit(1);
  const seq = maxRow && maxRow.length ? maxRow[0].seq + 1 : 1;

  const { count: aheadForSurge } = await supabase
    .from("tokens")
    .select("*", { count: "exact", head: true })
    .eq("salon_id", salon.id)
    .eq("day", day)
    .eq("status", "waiting");
  const surgeFee = (aheadForSurge || 0) >= SURGE_QUEUE_THRESHOLD ? SURGE_FEE_AMOUNT : 0;
  const totalAmount = subtotal - discountAmount + surgeFee;

  const { error: insertErr } = await supabase.from("tokens").insert({
    salon_id: salon.id,
    day,
    seq,
    name,
    phone: effectivePhone,
    service_id: primaryService.id,
    staff_id: staffId || null,
    status: "waiting",
    booking_type: "walkin",
    cart_items: cartItems,
    total_amount: totalAmount,
    surge_fee: surgeFee,
    discount_amount: discountAmount,
    channel_preference: channel,
    is_walkin_guest: isWalkinGuest,
  });
  if (insertErr) {
    return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: insertErr.message }) };
  }

  const { count: ahead } = await supabase
    .from("tokens")
    .select("*", { count: "exact", head: true })
    .eq("salon_id", salon.id)
    .eq("staff_id", staffId)
    .eq("day", day)
    .eq("status", "waiting")
    .lt("seq", seq);

  const aheadCount = ahead || 0;
  const estimatedWaitMinutes = aheadCount * totalDurationMinutes;

  let loyaltyMessage = null;
  let visitNumber = null;
  if (!isWalkinGuest) {
    const { count: pastVisits } = await supabase
      .from("tokens")
      .select("*", { count: "exact", head: true })
      .eq("salon_id", salon.id)
      .eq("phone", effectivePhone)
      .eq("status", "done");
    visitNumber = (pastVisits || 0) + 1;
    if (visitNumber % LOYALTY_EVERY === 0) {
      loyaltyMessage = `This is your visit #${visitNumber} — ask staff about your loyalty reward!`;
    } else {
      const toGo = LOYALTY_EVERY - (visitNumber % LOYALTY_EVERY);
      loyaltyMessage = `Visit #${visitNumber}. ${toGo} more visit${toGo > 1 ? "s" : ""} until your loyalty reward.`;
    }
  }

  const serviceNames = services.map((s) => s.name).join(", ");
  const confirmMsg =
    `${salon.name}: Your token T${seq} (${serviceNames}) is confirmed. ${aheadCount} ahead of you, ~${estimatedWaitMinutes} min wait.` +
    (surgeFee ? ` A ₹${surgeFee} high-demand fee applies right now.` : "") +
    (discountAmount ? ` ₹${discountAmount} happy-hours discount applied.` : "") +
    (loyaltyMessage ? ` ${loyaltyMessage}` : "");

  if (!isWalkinGuest && channel === "sms" && salon.sms_mode !== "mock") {
    await sendSms(effectivePhone, confirmMsg, salon.id);
  }

  return {
    statusCode: 200,
    headers: CORS_HEADERS,
    body: JSON.stringify({
      booking_type: "walkin",
      token: `T${seq}`,
      ahead: aheadCount,
      estimated_wait_minutes: estimatedWaitMinutes,
      service: serviceNames,
      cart_items: cartItems,
      amount: totalAmount,
      surge_fee: surgeFee,
      discount_amount: discountAmount,
      loyalty_message: loyaltyMessage,
      channel,
      whatsapp_message: confirmMsg,
    }),
  };
};
