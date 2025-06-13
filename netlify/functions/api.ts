import express, { Request, Router } from "express";
import { decryptRequest, encryptResponse } from "../lib/encryption.js";
import serverless from "serverless-http";

const app = express();
const router = Router();
app.use(express.json());

const PRIVATE_KEY = (process.env.PRIVATE_KEY as string)
  ?.split(String.raw`\n`)
  ?.join("\n");

router.post("/", async (req, res) => {
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
  const screenData = {
    screen: "SCREEN_NAME",
    data: {
      some_key: "some_value",
    },
  };

  // Return the response as plaintext
  res.send(encryptResponse(screenData, aesKeyBuffer, initialVectorBuffer));
});

router.get("/", (req, res) => {
  res.send(`<pre>Nothing to see here.
Checkout README.md to start.</pre>`);
});

app.use("/api/", router);

export const handler = serverless(app);
