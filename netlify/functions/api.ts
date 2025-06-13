import express, { Request, Router } from "express";
import { decryptRequest, encryptResponse } from "../lib/encryption.js";
import serverless from "serverless-http";

const app = express();
const router = Router();

app.use(
  express.json({
    // store the raw request body to use it for signature verification
    verify: (req, res, buf, encoding) => {
      req.rawBody = buf?.toString(encoding || "utf8");
    },
  })
);

app.use((req, res, next) => {
  console.log("incoming request", req.method, req.path);
  let data = "";
  req.on("data", (chunk) => {
    data += chunk;
  });
  req.on("end", () => {
    try {
      req.body = JSON.parse(data); // Manually parse to JSON
    } catch (e) {
      req.body = data; // fallback
    }
    next();
  });
});

const PRIVATE_KEY_BASE_64 = process.env.PRIVATE_KEY as string;
const PRIVATE_KEY = Buffer.from(PRIVATE_KEY_BASE_64, "base64").toString(
  "ascii"
);

router.post("/", async (req, res) => {
  console.warn(req.body);
  const { decryptedBody, aesKeyBuffer, initialVectorBuffer } = decryptRequest(
    req.body,
    PRIVATE_KEY
  );

  const { screen, data, version, action } = decryptedBody;
  console.warn("{ screen, data, version, action }", {
    screen,
    data,
    version,
    action,
  });
  // Return the next screen & data to the client
  const resData = {
    data: {
      status: "active",
    },
  };

  res.send(encryptResponse(resData, aesKeyBuffer, initialVectorBuffer));
});

router.get("/", (req, res) => {
  res.send(`<pre>Nothing to see here.
Checkout README.md to start.</pre>`);
});

app.use("/api/", router);

export const handler = serverless(app);
