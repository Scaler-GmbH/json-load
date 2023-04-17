import * as log from "https://deno.land/std@0.181.0/log/mod.ts";
import { ensureDirSync } from "https://deno.land/std@0.181.0/fs/ensure_dir.ts";
import { sizeHumanReadabletoBytes } from "./file.js";

import config from "./config.js";

export async function startLogger() {

    // Define the log levels.
    let fileLogLevel = config.logging.file.level || "INFO";
    let consoleLogLevel = config.logging.console.level || "DEBUG";

    // Set enableConsole to true if the config.logging.console object is defined
    let enableConsole = config.logging.console ? true : false;

    // Set enableFile to true if the config.logging.file object is defined
    let enableFile = config.logging.file ? true : false;

    let formatTypes = {
        default: "{datetime} {levelName} {msg}",
        json: rec => JSON.stringify({ ts: rec.datetime, level: rec.levelName, data: rec.msg })
    }

    let handlers = {};
    let loggers = {};

    if (enableConsole) {
        handlers.console = new log.handlers.ConsoleHandler(consoleLogLevel, {
            formatter: formatTypes[config.logging.console.format] || formatTypes.default
        })
        loggers.default = {
            level: consoleLogLevel,
            handlers: ["console"],
        }

    }

    if (enableFile) {
        // make sure config.logging.file.path is defined
        if (config.logging.file && !config.logging.file.path) {
            console.log(`%cCritical Error: config.logging.file.path is not defined, please check your config file`, "color: red")
            Deno.exit(1);
        }

        // make sure config.logging.file.maxBytes is defined
        config.logging.file.maxBytes = config.logging.file.maxBytes  || "10MB";
    
        // make sure config.logging.file.maxBackupCount is defined
        config.logging.file.maxBackupCount = config.logging.file.maxBackupCount || 10;

        // if config.logging.file.path  does not have a trailing slash, add it
        if (config.logging.file.path.slice(-1) != "/") {
            config.logging.file.path += "/";
        }
        // Create the directory if it does not exist
        ensureDirSync(config.logging.file.path);
        handlers.file = new log.handlers.RotatingFileHandler(fileLogLevel, {
            filename: config.logging.file.path + "logfile.log",
            maxBytes: sizeHumanReadabletoBytes(config.logging.file.maxBytes),
            maxBackupCount: config.logging.file.maxBackupCount,
            formatter: formatTypes[config.logging.file.format] || formatTypes.default
        })
        loggers.client = {
            level: fileLogLevel,
            handlers: ["file"]
        }
    }

    // If there are no handlers defined, that is a problem.
    if (Object.keys(handlers).length == 0) {
        console.log(`%cCritical Error: No logging handlers defined, please check your config file`, "color: red")
        Deno.exit(1);
    }

    await log.setup({ handlers: handlers, loggers: loggers });

    let toConsole = null
    let toFile = null

    if (enableConsole) {
        toConsole = log.getLogger();
    }

    if (enableFile) {
        toFile = log.getLogger('client');
    }

    function logger(level, message) {
        // If the console is enabled, log to the console.
        if (enableConsole) {
            toConsole[level](message);
        }
        // If the file is enabled, log to the file.
        if (enableFile) {
            toFile[level](message);
        }
    }

    logger("info", "Logger started")
    return logger;

}

