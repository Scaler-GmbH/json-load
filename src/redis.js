import { connect } from "https://deno.land/x/redis/mod.ts";
import config from "./config.js";

let redis = null;

async function connectToRedis() {
    // Check if we have already connected to redis
    if (redis) {
        return redis;
    }

    let redisConfig = {
        hostname: config.redis.hostname || "localhost",
        port: config.redis.port || 6379,
        db: config.redis.db || 0,
    }
    if (config.redis.auth) {
        redisConfig.password = config.redis.auth;
    }

    try {
        redis = await connect(redisConfig);
    } catch (err) {
        window.log("critical",`Error connecting to redis: ${err}`);
        Deno.exit(1);
    }

    return redis;

}


export {connectToRedis };