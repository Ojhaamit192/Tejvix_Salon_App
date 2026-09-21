/**
 * Sends the salon their share of a payment via RazorpayX Payouts, right
 * after a Razorpay checkout payment is verified. Uses the SAME
 * RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET as the payment gateway (RazorpayX
 * accepts these same credentials — no separate keys needed), plus one
 * extra variable: RAZORPAY_X_ACCOUNT_NUMBER (the RazorpayX current/virtual
 * account the money is paid out FROM).
 *
 * This is best-effort: if it fails (not configured, salon has no UPI ID
 * on file, network error), it returns a status string rather than
 * throwing — the booking itself must never be lost just because the
 * payout step had trouble. The status is stored on the token so it's
 * visible in the admin panel.
 */
async function payoutToSalon({ upiId, amountRupees, salonName, referenceId }) {
  const { RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_X_ACCOUNT_NUMBER } = process.env;

  if (!upiId) {
    return { status: "no_upi_on_file", payout_id: null };
  }
  if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET || !RAZORPAY_X_ACCOUNT_NUMBER) {
    console.log("[RazorpayX not configured] Skipping payout to", upiId, "amount", amountRupees);
    return { status: "not_attempted", payout_id: null };
  }

  const auth = Buffer.from(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`).toString("base64");

  try {
    const res = await fetch("https://api.razorpay.com/v1/payouts", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Basic ${auth}` },
      body: JSON.stringify({
        account_number: RAZORPAY_X_ACCOUNT_NUMBER,
        amount: Math.round(amountRupees * 100), // paise
        currency: "INR",
        mode: "UPI",
        purpose: "vendor_bill",
        queue_if_low_balance: true,
        reference_id: referenceId,
        narration: `Tejvix booking payout - ${salonName}`.slice(0, 30),
        fund_account: {
          account_type: "vpa",
          vpa: { address: upiId },
          contact: {
            name: salonName || "Salon",
            type: "vendor",
          },
        },
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      console.error("RazorpayX payout failed:", data);
      return { status: "failed", payout_id: null };
    }
    return { status: "success", payout_id: data.id || null };
  } catch (err) {
    console.error("RazorpayX payout request failed:", err.message);
    return { status: "failed", payout_id: null };
  }
}

module.exports = { payoutToSalon };
