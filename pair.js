const express = require("express");
const fs = require("fs");
const { exec } = require("child_process");
let router = express.Router();
const pino = require("pino");
const {
  default: makeWASocket,
  useMultiFileAuthState,
  delay,
  makeCacheableSignalKeyStore,
  Browsers,
  jidNormalizedUser,
} = require("@whiskeysockets/baileys");
const { upload } = require("./mega");

function removeFile(FilePath) {
  if (!fs.existsSync(FilePath)) return false;
  fs.rmSync(FilePath, { recursive: true, force: true });
}

router.get("/", async (req, res) => {
  let num = req.query.number;
  async function RobinPair() {
    const { state, saveCreds } = await useMultiFileAuthState(`./session`);
    try {
      let KaveemdPairWeb = makeWASocket({
        auth: {
          creds: state.creds,
          keys: makeCacheableSignalKeyStore(
            state.keys,
            pino({ level: "fatal" }).child({ level: "fatal" })
          ),
        },
        printQRInTerminal: false,
        logger: pino({ level: "fatal" }).child({ level: "fatal" }),
        browser: Browsers.macOS("Safari"),
      });

      if (!KaveemdPairWeb.authState.creds.registered) {
        await delay(1500);
        num = num.replace(/[^0-9]/g, "");
        const code = await KaveemdPairWeb.requestPairingCode(num);
        if (!res.headersSent) {
          await res.send({ code });
        }
      }

      KaveemdPairWeb.ev.on("creds.update", saveCreds);
      KaveemdPairWeb.ev.on("connection.update", async (s) => {
        const { connection, lastDisconnect } = s;
        if (connection === "open") {
          try {
            await delay(10000);
            const sessionPrabath = fs.readFileSync("./session/creds.json");

            const auth_path = "./session/";
            const user_jid = jidNormalizedUser(KaveemdPairWeb.user.id);

            function randomMegaId(length = 6, numberLength = 4) {
              const characters =
                "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
              let result = "";
              for (let i = 0; i < length; i++) {
                result += characters.charAt(
                  Math.floor(Math.random() * characters.length)
                );
              }
              const number = Math.floor(
                Math.random() * Math.pow(10, numberLength)
              );
              return `${result}${number}`;
            }

            const mega_url = await upload(
              fs.createReadStream(auth_path + "creds.json"),
              `${randomMegaId()}.json`
            );

            const string_session = mega_url.replace(
              "https://mega.nz/file/",
              ""
            );

            const sid = `👋 *KAVEE-md [The powerful Whatsapp BOT]* 👋\n\n👉 ${string_session} 👈\n\n*This is the your Session ID, copy this id and paste into config.js file*\n\n*You can ask any question using this link*\n\n*You can join my whatsapp group*`;
            const mg = `⚠ *Do not share this code to anyone* ⚠`;
            try {
              const dt = await KaveemdPairWeb.sendMessage(user_jid, {
                image: {
                  url: "https://raw.githubusercontent.com/Kaveemd17/BOT-IMGS/refs/heads/main/4e10a675-5de7-4552-8c31-b5dc1a31ed01.webp",
                },
                caption: sid,
              });
            } catch (error) {
              console.error("Failed to send welcome message:", error);
            }
            try {
              const msg = await KaveemdPairWeb.sendMessage(user_jid, {
                text: string_session,
              });
            } catch (error) {
              console.error("Failed to send session ID:", error);
            }
            try {
              const msg1 = await KaveemdPairWeb.sendMessage(user_jid, { text: mg });
            } catch (error) {
              console.error("Failed to send warning message:", error);
            }
          } catch (e) {
            console.error("Error in connection.update:", e);
            //Consider more sophisticated error handling here instead of pm2 restart
          }

          await delay(100);
          return await removeFile("./session");
          process.exit(0);
        } else if (
          connection === "close" &&
          lastDisconnect &&
          lastDisconnect.error &&
          lastDisconnect.error.output.statusCode !== 401
        ) {
          await delay(10000);
          KaveemdPair();
        }
      });
    } catch (err) {
      console.error("Error in KaveemdPair:", err);
      console.log("service restarted");
     
      await removeFile("./session");
      if (!res.headersSent) {
        await res.send({ code: "Service Unavailable" });
      }
       return RobinPair();
    }
  }
 return await RobinPair();
});

process.on("uncaughtException", function (err) {
  console.log("Caught exception: " + err);
  exec("pm2 restart KAVEE-MD");
});

module.exports = router;
