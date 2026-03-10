const axios = require("axios");

module.exports = async ({ to, subject, html }) => {
  if (!process.env.BREVO_API_KEY) {
    throw new Error("BREVO_API_KEY missing");
  }

  await axios.post(
    "https://api.brevo.com/v3/smtp/email",
    {
      sender: {
        name: "Kalyan",
        email: "no-reply@kalyansattaking.online"
      },
      to: [{ email: to }],
      subject,
      htmlContent: html
    },
    {
      headers: {
        "api-key": process.env.BREVO_API_KEY,
        "Content-Type": "application/json"
      }
    }
  );
};
