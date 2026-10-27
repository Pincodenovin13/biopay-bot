export default {
  async fetch(request, env) {
    const WEBHOOK_URL = env.WEBHOOK_URL || "https://biopay-bot.pin-code1367.workers.dev";
    const ADMIN_CHAT_ID = env.ADMIN_CHAT_ID || "-1004320824124";
    const INSTAGRAM_URL = env.INSTAGRAM_URL || "https://instagram.com/biopay.app";
    const CHANNEL_USERNAME = env.CHANNEL_USERNAME || "@BioPay_App";
    const API_BASE_URL = env.API_BASE_URL || "https://biopay.app/api";
    const BOT_SECRET = env.BOT_SECRET || "biopay_super_secret_2026";

    if (request.method === "GET") {
      try {
        const url = `https://api.telegram.org/bot${env.BOT_TOKEN}/setWebhook?url=${encodeURIComponent(WEBHOOK_URL)}`;
        await fetch(url);
        return new Response("Webhook is set successfully.", { status: 200 });
      } catch (e) {
        return new Response("Error setting webhook", { status: 500 });
      }
    }

    if (request.method === "POST") {
      try {
        const update = await request.json();
        const chatId = update.message ? update.message.chat.id.toString() : (update.callback_query ? update.callback_query.message.chat.id.toString() : null);

        // ── Rate Limiting ──
        if (chatId) {
          const now = new Date();
          const minuteKey = `rate_${chatId}_${now.getHours()}_${now.getMinutes()}`;
          const rateCount = parseInt(await env.BOT_KV.get(minuteKey) || "0");
          if (rateCount > 20) {
            if (update.message) {
              await sendTelegram(env.BOT_TOKEN, "sendMessage", { chat_id: chatId, text: "⚠️ Too many messages." });
            }
            return new Response("OK", { status: 200 });
          }
          await env.BOT_KV.put(minuteKey, (rateCount + 1).toString(), { expirationTtl: 120 });
        }

        // ── دستور /start ──
        if (update.message && update.message.text && update.message.text.startsWith("/start")) {
          const firstName = update.message.from.first_name || "دوست عزیز";
          await env.BOT_KV.put(`name_${chatId}`, firstName);
          await env.BOT_KV.put(`state_${chatId}`, "waiting_for_otp");

          await sendTelegram(env.BOT_TOKEN, "sendMessage", {
            chat_id: chatId,
            text: `سلام ${firstName} عزیز! 👋\nخوش اومدی به BioPay.\n\nHello ${firstName}! 👋\nWelcome to BioPay.\n\nمرحباً ${firstName}! 👋\nمرحباً بك في BioPay.\n\n🔑 لطفاً کد ۵ رقمی که در وب‌سایت دریافت کردی را وارد کن:\nPlease enter the 5-digit code from the website:\nالرجاء إدخال الرمز المكون من 5 أرقام من الموقع:`
          });
        }

        // ── دریافت متن‌های ورودی ──
        else if (update.message && update.message.text) {
          const text = update.message.text.trim();
          const state = await env.BOT_KV.get(`state_${chatId}`);

          if (state === "waiting_for_otp") {
            if (!/^\d{5}$/.test(text)) {
              const failCount = parseInt(await env.BOT_KV.get(`otp_fail_${chatId}`) || "0");
              if (failCount >= 3) {
                await sendTelegram(env.BOT_TOKEN, "sendMessage", { chat_id: chatId, text: "⛔️ 3 wrong attempts. Wait 30 minutes." });
                await env.BOT_KV.put(`otp_ban_${chatId}`, "true", { expirationTtl: 1800 });
              } else {
                await env.BOT_KV.put(`otp_fail_${chatId}`, (failCount + 1).toString());
                await sendTelegram(env.BOT_TOKEN, "sendMessage", { chat_id: chatId, text: `⚠️ Code must be 5 digits. Attempt ${failCount + 1}/3.` });
              }
              return new Response("OK", { status: 200 });
            }

            try {
              const res = await fetch(`${API_BASE_URL}/bot/verify-otp`, {
                method: "POST",
                headers: { "Content-Type": "application/json", "x-bot-secret": BOT_SECRET },
                body: JSON.stringify({ otp: text, telegramId: chatId })
              });
              const data = await res.json();

              if (data.ok) {
                await env.BOT_KV.put(`email_${chatId}`, data.email);
                await env.BOT_KV.put(`role_${chatId}`, data.role);
                await env.BOT_KV.put(`state_${chatId}`, "waiting_for_country");
                await sendTelegram(env.BOT_TOKEN, "sendMessage", {
                  chat_id: chatId,
                  text: `🎉 Registration verified with email: ${data.email}\n\n🌍 Now enter your country:\n🌍 حالا کشورت را وارد کن:\n🌍 الآن أدخل بلدك:`,
                  parse_mode: "HTML"
                });
              } else {
                const failCount = parseInt(await env.BOT_KV.get(`otp_fail_${chatId}`) || "0");
                if (failCount >= 3) {
                  await sendTelegram(env.BOT_TOKEN, "sendMessage", { chat_id: chatId, text: "⛔️ 3 wrong attempts. Wait 30 minutes." });
                  await env.BOT_KV.put(`otp_ban_${chatId}`, "true", { expirationTtl: 1800 });
                } else {
                  await env.BOT_KV.put(`otp_fail_${chatId}`, (failCount + 1).toString());
                  await sendTelegram(env.BOT_TOKEN, "sendMessage", { chat_id: chatId, text: `⚠️ Wrong code. Attempt ${failCount + 1}/3.` });
                }
              }
            } catch (e) {
              await sendTelegram(env.BOT_TOKEN, "sendMessage", { chat_id: chatId, text: "⚠️ Server error. Try later." });
            }
          }

          else if (state === "waiting_for_country") {
            await env.BOT_KV.put(`country_${chatId}`, text);
            await sendTelegram(env.BOT_TOKEN, "sendMessage", { chat_id: chatId, text: "Enter city / شهر را وارد کن / أدخل المدينة:" });
            await env.BOT_KV.put(`state_${chatId}`, "waiting_for_city");
          }

          else if (state === "waiting_for_city") {
            await env.BOT_KV.put(`city_${chatId}`, text);
            await sendTelegram(env.BOT_TOKEN, "sendMessage", { chat_id: chatId, text: "Enter Instagram ID (without @) / آیدی اینستاگرام (بدون @) / معرف إنستغرام (بدون @):" });
            await env.BOT_KV.put(`state_${chatId}`, "waiting_for_insta");
          }

          else if (state === "waiting_for_insta") {
            await env.BOT_KV.put(`insta_${chatId}`, text);
            const role = await env.BOT_KV.get(`role_${chatId}`);
            
            if (role === "referrer") {
              await sendTelegram(env.BOT_TOKEN, "sendMessage", {
                chat_id: chatId,
                text: "Need 500 followers for commission. Do you have it?\nبرای پورسانت ۵۰۰ فالوور نیاز است. داری؟\nهل لديك 500 متابع؟",
                reply_markup: { inline_keyboard: [[{ text: "✅ Yes / بله / نعم", callback_data: "follower_yes" }], [{ text: "❌ No / نه / لا", callback_data: "follower_no" }]] }
              });
            } else {
              await sendFollowButtons(env, chatId, INSTAGRAM_URL, CHANNEL_USERNAME);
            }
          }

          else if (state === "waiting_for_sheba") {
            if (!/^\d{24}$/.test(text)) {
              await sendTelegram(env.BOT_TOKEN, "sendMessage", { chat_id: chatId, text: "⚠️ SHEBA must be 24 digits / شبا باید ۲۴ رقم باشد / يجب أن يكون 24 رقماً:" });
              return new Response("OK", { status: 200 });
            }
            await env.BOT_KV.put(`sheba_${chatId}`, text);
            await sendTelegram(env.BOT_TOKEN, "sendMessage", { chat_id: chatId, text: "✅ SHEBA saved. Do you have Tether?\n✅ شبا ثبت شد. تتر داری؟\n✅ تم حفظ شبا. هل لديك تيثر؟", reply_markup: { inline_keyboard: [[{ text: "💎 Yes / بله / نعم", callback_data: "has_tether" }], [{ text: "❌ No / نه / لا", callback_data: "no_tether" }]] } });
          }

          else if (state === "waiting_for_tether") {
            await env.BOT_KV.put(`tether_${chatId}`, text);
            await sendTelegram(env.BOT_TOKEN, "sendMessage", { chat_id: chatId, text: "Tether address correct?\nآدرس تتر درست است؟\nهل العنوان صحيح؟", reply_markup: { inline_keyboard: [[{ text: "✅ Yes / بله / نعم", callback_data: "tether_confirm" }], [{ text: "✏️ Edit / اصلاح / تعديل", callback_data: "tether_edit" }]] } });
          }

          else if (state === "editing_tether") {
            await env.BOT_KV.put(`tether_${chatId}`, text);
            await sendPreview(env, chatId);
            await env.BOT_KV.put(`state_${chatId}`, "waiting_for_confirm");
          }
        }

        // ── دکمه‌های شیشه‌ای ──
        else if (update.callback_query) {
          const cb = update.callback_query;
          const data = cb.data;

          if (data === "follower_yes") {
            await sendFollowButtons(env, chatId, INSTAGRAM_URL, CHANNEL_USERNAME);
            await sendTelegram(env.BOT_TOKEN, "answerCallbackQuery", { callback_query_id: cb.id });
          } else if (data === "follower_no") {
            await sendTelegram(env.BOT_TOKEN, "sendMessage", { chat_id: chatId, text: "❌ Rejected. Need 500 followers.\n❌ رد شد. نیاز به ۵۰۰ فالوور.\n❌ مرفوض. تحتاج 500 متابع." });
            await env.BOT_KV.delete(`state_${chatId}`);
            await sendTelegram(env.BOT_TOKEN, "answerCallbackQuery", { callback_query_id: cb.id });
          }

          if (data === "insta_followed") {
            await env.BOT_KV.put(`insta_followed_${chatId}`, "true");
            await sendTelegram(env.BOT_TOKEN, "sendMessage", { chat_id: chatId, text: "Choose payout method:\nروش پرداخت را انتخاب کن:\nاختر طريقة الدفع:", reply_markup: { inline_keyboard: [[{ text: "💳 SHEBA / شبا", callback_data: "pay_sheba" }], [{ text: "💎 Tether / تتر", callback_data: "pay_tether" }]] } });
            await sendTelegram(env.BOT_TOKEN, "answerCallbackQuery", { callback_query_id: cb.id });
          }

          if (data === "pay_sheba" || data === "pay_tether") {
            const method = data === "pay_sheba" ? "sheba" : "tether";
            await env.BOT_KV.put(`payment_method_${chatId}`, method);
            if (method === "sheba") {
              await sendTelegram(env.BOT_TOKEN, "sendMessage", { chat_id: chatId, text: "Enter SHEBA (24 digits, no IR):\nشبا (۲۴ رقم، بدون IR):\nشبا (24 رقماً، بدون IR):" });
              await env.BOT_KV.put(`state_${chatId}`, "waiting_for_sheba");
            } else {
              await sendTelegram(env.BOT_TOKEN, "sendMessage", { chat_id: chatId, text: "Enter Tether (TRC20) address:\nآدرس تتر (TRC20):\nعنوان Tether (TRC20):" });
              await env.BOT_KV.put(`state_${chatId}`, "waiting_for_tether");
            }
            await sendTelegram(env.BOT_TOKEN, "answerCallbackQuery", { callback_query_id: cb.id });
          }

          if (data === "tether_confirm") {
            await sendPreview(env, chatId);
            await env.BOT_KV.put(`state_${chatId}`, "waiting_for_confirm");
            await sendTelegram(env.BOT_TOKEN, "answerCallbackQuery", { callback_query_id: cb.id });
          } else if (data === "tether_edit") {
            await sendTelegram(env.BOT_TOKEN, "sendMessage", { chat_id: chatId, text: "Re-enter Tether address:\nدوباره تتر را وارد کن:\nأعد إدخال Tether:" });
            await env.BOT_KV.put(`state_${chatId}`, "editing_tether");
            await sendTelegram(env.BOT_TOKEN, "answerCallbackQuery", { callback_query_id: cb.id });
          }

          if (data === "no_tether") {
            await env.BOT_KV.put(`tether_${chatId}`, "none");
            await sendPreview(env, chatId);
            await env.BOT_KV.put(`state_${chatId}`, "waiting_for_confirm");
            await sendTelegram(env.BOT_TOKEN, "answerCallbackQuery", { callback_query_id: cb.id });
          }

          if (data === "has_tether") {
            await sendTelegram(env.BOT_TOKEN, "sendMessage", { chat_id: chatId, text: "Enter Tether (TRC20) address:\nآدرس تتر (TRC20):\nعنوان Tether (TRC20):" });
            await env.BOT_KV.put(`state_${chatId}`, "waiting_for_tether");
            await sendTelegram(env.BOT_TOKEN, "answerCallbackQuery", { callback_query_id: cb.id });
          }

          if (data === "edit_info") {
            await sendTelegram(env.BOT_TOKEN, "sendMessage", {
              chat_id: chatId,
              text: "Which part?\nکدوم بخش؟\nأي جزء؟",
              reply_markup: { inline_keyboard: [[{ text: "📸 Instagram / اینستاگرام", callback_data: "edit_insta" }], [{ text: "🌍 Country / کشور", callback_data: "edit_country" }], [{ text: "🏙️ City / شهر", callback_data: "edit_city" }], [{ text: "💳 Payment / پرداخت", callback_data: "edit_payment" }]] }
            });
            await sendTelegram(env.BOT_TOKEN, "answerCallbackQuery", { callback_query_id: cb.id });
          }

          if (data === "edit_insta") { await sendTelegram(env.BOT_TOKEN, "sendMessage", { chat_id: chatId, text: "New Instagram ID:\nآیدی اینستاگرام جدید:\nمعرف إنستغرام الجديد:" }); await env.BOT_KV.put(`state_${chatId}`, "editing_insta"); }
          else if (data === "edit_country") { await sendTelegram(env.BOT_TOKEN, "sendMessage", { chat_id: chatId, text: "New country:\nکشور جدید:\nالبلد الجديد:" }); await env.BOT_KV.put(`state_${chatId}`, "editing_country"); }
          else if (data === "edit_city") { await sendTelegram(env.BOT_TOKEN, "sendMessage", { chat_id: chatId, text: "New city:\nشهر جدید:\nالمدينة الجديدة:" }); await env.BOT_KV.put(`state_${chatId}`, "editing_city"); }
          else if (data === "edit_payment") { await sendTelegram(env.BOT_TOKEN, "sendMessage", { chat_id: chatId, text: "New SHEBA or Tether:\nشبا یا تتر جدید:\nشبا أو تيثر جديد:" }); await env.BOT_KV.put(`state_${chatId}`, "editing_payment"); }

          if (data === "confirm_send") {
            const name = await env.BOT_KV.get(`name_${chatId}`);
            const email = await env.BOT_KV.get(`email_${chatId}`);
            const role = await env.BOT_KV.get(`role_${chatId}`);
            const country = await env.BOT_KV.get(`country_${chatId}`);
            const city = await env.BOT_KV.get(`city_${chatId}`);
            const insta = await env.BOT_KV.get(`insta_${chatId}`);
            const method = await env.BOT_KV.get(`payment_method_${chatId}`);
            const value = method === "sheba" ? await env.BOT_KV.get(`sheba_${chatId}`) : await env.BOT_KV.get(`tether_${chatId}`);

            const roleName = role === "seller" ? "🔥 Seller" : "🤝 Referrer";
            const paymentLabel = method === "sheba" ? "SHEBA" : "Tether";

            const adminMsg = 
              `📥 <b>New Verification</b>\n\n` +
              `👤 Name: <b>${name}</b>\n` +
              `📧 Email: <b>${email}</b>\n` +
              `🆔 Telegram: <code>${chatId}</code>\n` +
              `👤 Role: <b>${roleName}</b>\n` +
              `📸 Instagram: <b>@${insta}</b>\n` +
              `🌍 Country: ${country} - City: ${city}\n` +
              `💳 Payment: ${paymentLabel} - <code>${value}</code>`;

            await sendTelegram(env.BOT_TOKEN, "sendMessage", {
              chat_id: ADMIN_CHAT_ID, text: adminMsg, parse_mode: "HTML",
              reply_markup: { inline_keyboard: [[{ text: "✅ Approve", callback_data: `admin_approve_${chatId}` }, { text: "❌ Reject", callback_data: `admin_reject_${chatId}` }], [{ text: "✏️ Edit", callback_data: `admin_edit_${chatId}` }]] }
            });

            await sendTelegram(env.BOT_TOKEN, "sendMessage", { chat_id: chatId, text: "✅ Submitted. Wait for approval.\n✅ ثبت شد. منتظر تایید.\n✅ تم التسجيل. انتظر الموافقة." });
            await env.BOT_KV.delete(`state_${chatId}`);
            await sendTelegram(env.BOT_TOKEN, "answerCallbackQuery", { callback_query_id: cb.id });
          }

          if (data.startsWith("admin_approve_")) {
            const targetUser = data.split("_")[2];
            const email = await env.BOT_KV.get(`email_${targetUser}`);
            let refLink = "";
            try {
              const res = await fetch(`${API_BASE_URL}/bot/verify-user`, {
                method: "POST",
                headers: { "Content-Type": "application/json", "x-bot-secret": BOT_SECRET },
                body: JSON.stringify({ telegramId: targetUser, email: email })
              });
              const resData = await res.json();
              if (resData.ok) refLink = resData.referralLink;
            } catch (e) { console.error(e); }

            await sendTelegram(env.BOT_TOKEN, "sendMessage", { chat_id: targetUser, text: `🎉 Approved!\n\n📧 Email: ${email}\n🔗 Referral: <code>${refLink || "Pending"}</code>\n\nReturn to website.\n\n🎉 تایید شد!\n🔗 لینک رفرال: <code>${refLink || "در انتظار"}</code>\n\nبه سایت برگرد.\n\n🎉 تمت الموافقة!\n🔗 رابط الإحالة: <code>${refLink || "في انتظار"}</code>\n\nعد إلى الموقع.`, parse_mode: "HTML" });
            await sendTelegram(env.BOT_TOKEN, "editMessageText", { chat_id: ADMIN_CHAT_ID, message_id: cb.message.message_id, text: cb.message.text + "\n\n✅ Approved", reply_markup: { inline_keyboard: [] } });
            await sendTelegram(env.BOT_TOKEN, "answerCallbackQuery", { callback_query_id: cb.id });
          }

          if (data.startsWith("admin_reject_")) {
            const targetUser = data.split("_")[2];
            await sendTelegram(env.BOT_TOKEN, "sendMessage", { chat_id: targetUser, text: "❌ Rejected. Contact support.\n❌ رد شد. با پشتیبانی تماس بگیر.\n❌ مرفوض. اتصل بالدعم." });
            await sendTelegram(env.BOT_TOKEN, "editMessageText", { chat_id: ADMIN_CHAT_ID, message_id: cb.message.message_id, text: cb.message.text + "\n\n❌ Rejected", reply_markup: { inline_keyboard: [] } });
            await sendTelegram(env.BOT_TOKEN, "answerCallbackQuery", { callback_query_id: cb.id });
          }

          if (data.startsWith("admin_edit_")) {
            const targetUser = data.split("_")[2];
            await sendTelegram(env.BOT_TOKEN, "sendMessage", { chat_id: targetUser, text: "Please edit your info.\nلطفاً اطلاعات را اصلاح کن.\nيرجى تعديل معلوماتك." });
            await env.BOT_KV.put(`state_${targetUser}`, "waiting_for_insta");
            await sendTelegram(env.BOT_TOKEN, "editMessageText", { chat_id: ADMIN_CHAT_ID, message_id: cb.message.message_id, text: cb.message.text + "\n\n✏️ Needs edit", reply_markup: { inline_keyboard: [] } });
            await sendTelegram(env.BOT_TOKEN, "answerCallbackQuery", { callback_query_id: cb.id });
          }
        }

        return new Response("OK", { status: 200 });
      } catch (e) {
        return new Response(`Error: ${e.message}`, { status: 500 });
      }
    }
    return new Response("Method Not Allowed", { status: 405 });
  }
};

async function sendFollowButtons(env, chatId, instagramUrl, channelUsername) {
  await sendTelegram(env.BOT_TOKEN, "sendMessage", {
    chat_id: chatId,
    text: "Follow Instagram & Join Channel:\nاینستاگرام و کانال را فالو کن:\nتابع إنستغرام وانضم إلى القناة:",
    reply_markup: { inline_keyboard: [[{ text: "📸 Instagram", url: instagramUrl }], [{ text: "📢 Channel", url: `https://t.me/${channelUsername.replace('@', '')}` }], [{ text: "✅ Done / انجام دادم / فعلت", callback_data: "insta_followed" }]] }
  });
}

async function sendPreview(env, chatId) {
  const name = await env.BOT_KV.get(`name_${chatId}`);
  const email = await env.BOT_KV.get(`email_${chatId}`);
  const role = await env.BOT_KV.get(`role_${chatId}`);
  const country = await env.BOT_KV.get(`country_${chatId}`);
  const city = await env.BOT_KV.get(`city_${chatId}`);
  const insta = await env.BOT_KV.get(`insta_${chatId}`);
  const method = await env.BOT_KV.get(`payment_method_${chatId}`);
  const value = method === "sheba" ? await env.BOT_KV.get(`sheba_${chatId}`) : await env.BOT_KV.get(`tether_${chatId}`);

  let preview = `📋 <b>Preview / پیش‌نمایش / معاينة:</b>\n\n👤 Name: ${name}\n📧 Email: ${email}\n👤 Role: ${role === "seller" ? "Seller" : "Referrer"}\n📸 Instagram: @${insta}\n🌍 Country: ${country} - City: ${city}\n💳 Payment: ${method === "sheba" ? "SHEBA" : "Tether"} - ${value}`;

  await sendTelegram(env.BOT_TOKEN, "sendMessage", { chat_id: chatId, text: preview, parse_mode: "HTML", reply_markup: { inline_keyboard: [[{ text: "✅ Confirm / تایید / تأكيد", callback_data: "confirm_send" }], [{ text: "✏️ Edit / اصلاح / تعديل", callback_data: "edit_info" }]] } });
}

async function sendTelegram(token, method, body) {
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return await res.json();
  } catch (e) { console.error("Telegram API Error:", e); }
}
