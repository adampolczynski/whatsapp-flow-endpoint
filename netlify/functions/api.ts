import express, { Request, Router } from "express";
import { decryptRequest, encryptResponse } from "../lib/encryption.js";
import serverless from "serverless-http";
import axios, { AxiosResponse } from "axios";

const app = express();
const router = Router();

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
  const { decryptedBody, aesKeyBuffer, initialVectorBuffer } = decryptRequest(
    req.body,
    PRIVATE_KEY
  );

  const { screen, data, version, action } = decryptedBody;

  console.warn("decryptedBody", decryptedBody);

  let receivedData = {} as Record<string, any>;
  switch (screen) {
    case "SIGN_IN":
      receivedData = data as SignInFlowData;
      let loginRes;
      try {
        ({ data: loginRes } = await login(
          receivedData.phone,
          receivedData.pin
        ));

        const graphlRes = await graphql(loginRes.jwt);
        console.warn("graphqlres: ", graphlRes);
      } catch (e) {
        return res.json({
          action: "ERROR",
          data: {
            message: JSON.stringify(e?.response?.data || "error"),
          },
        });
      }
      const { jwt, user } = loginRes;
      return res.json({
        action: "CONTINUE",
        data: {
          screen: {
            type: "message",
            text: `Witaj ${user?.firstName}! Zalogowano pomyślnie.`,
          },
        },
        session_data: {
          jwt,
        },
      });
      break;
    case "SIGN_UP":
      receivedData = data as SignUpFlowData;
      let registerRes;
      try {
        ({ data: registerRes } = await register(
          receivedData.first_name,
          receivedData.last_name,
          receivedData.phone,
          receivedData.pin,
          receivedData.referral_code
        ));
      } catch (e) {
        return res.json({
          action: "ERROR",
          data: {
            message: JSON.stringify(e?.response?.data || "error"),
          },
        });
      }
      const { user: regUser } = registerRes;
      return res.json({
        screen: "VERIFY_OTP",
        data: {
          screen: {
            type: "message",
            text: `Witaj ${regUser?.firstName}! Zarejestrowano pomyślnie. Otrzymałeś kod OTP na swoj numer telefonu`,
          },
        },
      });
      break;
    default:
      receivedData = data as Record<string, any>;
      break;
  }
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

type SignInFlowData = {
  phone: string;
  pin: string;
};
type SignUpFlowData = {
  first_name: string;
  last_name: string;
  phone: string;
  pin: string;
  confirm_pin: string;
  referral_code?: string;
};

const login = async (
  username: string,
  pin: string
): Promise<AxiosResponse<{ jwt: string; user: any }>> => {
  try {
    return await axios.post(process.env.API_URL + "/login", {
      username,
      password: pin,
    });
  } catch (error) {
    console.warn(error?.response?.data || error);
    return Promise.reject(error);
  }
};

const register = async (
  firstName: string,
  lastName: string,
  phone: string,
  pin: string,
  referralCode?: string
): Promise<AxiosResponse<{ user: any }>> => {
  try {
    return await axios.post(process.env.API_URL + "/register", {
      firstName,
      lastName,
      username: phone,
      password: pin,
      referralCode,
    });
  } catch (error) {
    console.warn(error?.response?.data || error);
    return Promise.reject(error);
  }
};

const graphql = async (jwt: string): Promise<AxiosResponse<{ user: any }>> => {
  try {
    return await axios.post(
      process.env.API_URL + "/graphql",
      {
        query: `
      query PostsForAuthor {
        author(id: 1) {
          firstName
            posts {
              title
              votes
            }
          }
        }
      `,
      },
      {
        headers: {
          Authorization: `Bearer ${jwt}`,
        },
      }
    );
  } catch (error) {
    console.warn(error?.response?.data || error);
    return Promise.reject(error);
  }
};
