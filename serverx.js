// Trusted host startup seam; dependencies are initialized only by startServer().
let startPromise;
let firstOptions;
function startServer(options) {
  if (startPromise) {
    if (options !== undefined && options !== firstOptions) {
      return Promise.reject(
        new Error("Startup already initialized with different options"),
      );
    }
    return startPromise;
  }
  firstOptions = options === undefined ? {} : options;
  startPromise = Promise.resolve().then(() => launch(firstOptions));
  return startPromise;
}
async function launch(options) {
  if (!options || typeof options !== "object" || Array.isArray(options)) {
    throw new Error("Invalid startup options");
  }
  const express = require("express");
  const cors = require("cors");
  const { readdirSync } = require("fs");
  require("dotenv").config();

  const app = express();

  const { connectRedis } = require("./config/redis");

  app.set("trust proxy", true);

  if (process.env.NODE_ENV !== "production") {
    const morgan = require("morgan");
    app.use(morgan("dev"));
  }

  app.use(express.json({ limit: "2mb" }));

  const allowedOrigins = [
    "https://cosmic.clavstore.com",
    "https://store.clavstore.com",
    "https://clavstore.com",
    "https://www.clavstore.com",
    "https://learnclavstore.com",
    "https://www.learnclavstore.com",
    "http://localhost:3005",
    "http://localhost:3004",
    "capacitor://localhost",
    "ionic://localhost",
    "http://localhost",
    "http://127.0.0.1:3004",
  ];

  app.use(
    cors({
      origin: function (origin, callback) {
        if (!origin) {
          return callback(null, true);
        }
        if (allowedOrigins.includes(origin)) {
          callback(null, true);
        } else {
          callback(new Error("Not allowed by CORS"));
        }
      },
      methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
      credentials: true,
    }),
  );

  // Trusted host input only. P6 must implement this inert assembly/lifecycle contract.
  let assembly;
  let scannerOpen = false;
  let scannerPrepared = false;
  let scannerState = "disabled";
  let drainPromise;
  const isPromise = (value) => value && typeof value.then === "function";
  function closeHandle(value) {
    if (!value || typeof value.close !== "function") {
      throw new Error("Scanner ownership cannot be verified as drained");
    }
    const result = value.close();
    if (!isPromise(result))
      throw new Error("Scanner drain acknowledgement required");
    return result;
  }
  function retireScanner() {
    scannerOpen = false;
    if (scannerState === "configured") scannerState = "draining";
    if (!drainPromise) {
      drainPromise = assembly
        ? Promise.resolve().then(() => closeHandle(assembly))
        : Promise.resolve();
      // Retain the same promise/owner even on failure. Never claim successful drain on timeout.
      void drainPromise.then(
        () => {
          if (scannerState === "draining") scannerState = "closed";
        },
        () => {
          if (scannerState === "draining") scannerState = "unavailable";
        },
      );
    }
    return drainPromise;
  }
  function prepareScanner(prefix) {
    if (scannerPrepared) return;
    scannerPrepared = true;
    if (process.env.MULTI_SCAN_ENABLED !== "true") return;
    try {
      const requested = options.scanner;
      if (requested === undefined || (requested && requested.enabled === false))
        return;
      if (
        !requested ||
        typeof requested !== "object" ||
        Array.isArray(requested) ||
        Object.keys(requested).some(
          (k) => !["enabled", "createAssembly"].includes(k),
        ) ||
        requested.enabled !== true ||
        typeof requested.createAssembly !== "function"
      ) {
        throw new Error("Missing trusted scanner assembly");
      }
      assembly = requested.createAssembly();
      if (isPromise(assembly)) {
        drainPromise = Promise.resolve(assembly).then(closeHandle);
        void drainPromise.catch(() => {});
        throw new Error("Asynchronous scanner construction is unsupported");
      }
      if (
        !assembly ||
        typeof assembly.router !== "function" ||
        typeof assembly.isReady !== "function" ||
        typeof assembly.close !== "function"
      ) {
        throw new Error("Invalid trusted scanner assembly");
      }
      const originalAssembly = assembly;
      assembly = Object.freeze({
        router: originalAssembly.router,
        isReady: originalAssembly.isReady.bind(originalAssembly),
        close: originalAssembly.close.bind(originalAssembly),
      });
      const ready = assembly.isReady();
      if (isPromise(ready)) void Promise.resolve(ready).catch(() => {});
      if (ready !== true) throw new Error("Scanner dependencies unavailable");
      const router = assembly.router;
      // Scope fence, not authentication. P6's router must enforce P1-P5 for every operation.
      app.use(prefix, (req, res, next) => {
        const path = req.path;
        if (
          typeof path !== "string" ||
          (path !== "/ai/multi-scan" && !path.startsWith("/ai/multi-scan/"))
        )
          return next();
        if (!scannerOpen) {
          return res
            .status(503)
            .set("Cache-Control", "no-store")
            .json({
              ok: false,
              error: {
                code: "SCANNER_UNAVAILABLE",
                message: "Scanner unavailable",
              },
            });
        }
        return router(req, res, next);
      });
      scannerOpen = true;
      scannerState = "configured";
    } catch {
      scannerState = "unavailable";
      void retireScanner().catch(() => {});
      console.warn("Scanner startup unavailable; scanner remains closed");
    }
  }
  // Preserve the filesystem's original order for all non-scanner routes.
  readdirSync("./routes").map((file) => {
    const prefix = "/" + process.env.API_ROUTES;
    if (file === "multi-scan.js") return prepareScanner(prefix);
    return app.use(prefix, require("./routes/" + file));
  });
  const port = process.env.PORT || 8000;
  let server;
  try {
    await connectRedis();
    server = await new Promise((resolve, reject) => {
      const listener = app.listen(port, () => {
        listener.removeListener("error", reject);
        resolve(listener);
      });
      listener.once("error", reject);
    });
    console.log(`Server running on port ${port}`);
  } catch (error) {
    void retireScanner().catch(() => {});
    throw error;
  }
  let stopPromise;
  let httpHasClosed = false;
  function stop() {
    if (!stopPromise) {
      const scannerDrain = retireScanner(); // Fence new scanner calls before HTTP shutdown.
      const httpClosed = new Promise((resolve, reject) => {
        if (httpHasClosed) return resolve();
        if (!server.listening) return server.once("close", resolve);
        server.close((error) => (error ? reject(error) : resolve()));
      });
      stopPromise = Promise.all([httpClosed, scannerDrain]).then(
        () => undefined,
      );
      void stopPromise.catch(() => {});
    }
    return stopPromise;
  }
  server.once("close", () => {
    httpHasClosed = true;
    void retireScanner().catch(() => {});
  });
  return Object.freeze({ server, stop, scannerStatus: () => scannerState });
}
if (require.main === module) {
  startServer().catch((error) => {
    console.error("Failed to start server:", error);
    process.exit(1);
  });
}
module.exports = { startServer };
