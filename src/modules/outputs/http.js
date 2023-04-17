import config from "../../config.js";
import { sizeHumanReadabletoBytes } from "../../file.js";

let retryQueue = {};
// Get the max queue size from the config file, if it is not defined, default to 1GB
let maxQueueSize = 1024 * 1024 * 1024;
let maxRetryCount = 5
const backoffMultiplier = 2;

export async function emit(dataset, data) {
    maxQueueSize = sizeHumanReadabletoBytes(config.datasets[dataset].outputs.http.backlog.maxQueueSize) || maxQueueSize;
    maxRetryCount = config.datasets[dataset].outputs.http.backlog.maxRetryCount || maxRetryCount;

    window.log("debug", `HTTP Output module called`);
    retryQueueStart();
    let payload = '';

    for (let record of data) {
        record = JSON.stringify(record) || '';
        record = `{"message_raw": ${record}}`
        //add a new line character to record
        record += '\n';
        payload += record;

    }
    data = null;

    let response = await httpPost(dataset, payload);
    response = null;
    payload = null;

}

function getSizeInBytes(obj) {
    let json = JSON.stringify(obj);
    let bytes = new TextEncoder().encode(json).length;
    json = null;
    return bytes;
}

let queueIsStarted = false;

async function retryQueueStart() {
    if (!queueIsStarted) {
        queueIsStarted = true;
        window.log("debug", `Starting HTTP output module retry queue`);
        processRetryQueue();

    }
}


let queueIsRunning = false;

async function processRetryQueue() {
    // For every dataset in the retry queue, check if we can send it again. 
    // We can send it again if the retry count is less than the max retry count
    // We also gradually back off with the first retry occuring no sooner than 10 seconds after the first failure
    let currentQueueSize = null
    try {
        currentQueueSize = getSizeInBytes(retryQueue) || null;
    } catch (error) {
        window.log("error", `HTTP output module: Error getting retry queue size: ${error}`);
        currentQueueSize = null;
    }
    // If we exceed maxQueueSizeKB, we will fail hard. This needs improving.
    if (currentQueueSize > maxQueueSize || currentQueueSize == null) {
        window.log("critical", `HTTP output module: Retry queue size exceeded ${maxQueueSize}. Failing hard.`);
        Deno.exit(1);
    }

    window.log("debug", `Memory: ${Deno.memoryUsage().heapUsed} bytes used. Total: ${Deno.memoryUsage().heapTotal} bytes`);
    if (!queueIsRunning) {
        queueIsRunning = true;

        let retryQueueIsEmpty = true;
        for (let dataset in retryQueue) {
            if (Object.keys(retryQueue[dataset]).length > 0) {
                retryQueueIsEmpty = false;
            }
        }
        if (retryQueueIsEmpty == false) {

            for (let dataset in retryQueue) {
                window.log("debug", `HTTP output module: Processing retry queue for dataset ${dataset}`);
                for (let retryID in retryQueue[dataset]) {
                    window.PAUSEINPUTQUEUE = true;
                    let retry = retryQueue[dataset][retryID];
                    window.log("warning", `The last retry for ${retryID} was ${retry.lastretry}`);
                    let nextEligibleRetry = (retry.lastretry + (10000 * backoffMultiplier ** retry.count));
                    window.log("warning", `HTTP output module: Next eligible retry for ${retryID} is ${nextEligibleRetry}`);
                    window.log("warning", `The current retry count is ${retry.count} and the max retry count is ${maxRetryCount}`)
                    if (retry.count < maxRetryCount && (Date.now()) >= nextEligibleRetry) {
                        window.log("warning", `HTTP output module: Sending ${dataset} to ${retry.URL} with retry ID ${retryID}`);
                        let response = await httpPost(dataset, retry.data, retry.headers, retry.URL, true);
                        if (response && response.status >= 200 && response.status < 300) {
                            window.log("warning", `HTTP output module: Successfully sent ${dataset} to ${retry.URL} with retry ID ${retryID}`);
                            retry.data = null;
                            delete retryQueue[dataset][retryID];
                            
                        } else {
                            window.log("error", `HTTP output module: Retry number ${retry.count} failed to send ${dataset} to ${retry.URL} with retry ID ${retryID}`);
                            retryQueue[dataset][retryID].count++;
                            retryQueue[dataset][retryID].lastretry = Date.now();
                        }
                        response = null;
                    } else {
                        window.log("debug", `HTTP output module: Skipping ${dataset} to ${retry.URL} with retry ID ${retryID}`);
                        if (retry.count >= maxRetryCount) {
                            window.log("error", `HTTP output module: Max retry count exceeded for ${dataset} to ${retry.URL} with retry ID ${retryID}. We will not retry this request again and it will be lost.`);
                            retry.data = null;
                            delete retryQueue[dataset][retryID];
                        }
                    }
                }
            }
            

            // if all retry queues for all datasets are empty, we can resume the input queue
        } else {
            window.PAUSEINPUTQUEUE = false;
        }

        queueIsRunning = false;

    }

    setTimeout(() => {
        processRetryQueue();
    }, 100);

}

async function httpPost(dataset, data, isRetry = false) {

    let headers = config.datasets[dataset].outputs.http.headers || {};
    let URL = config.datasets[dataset].outputs.http.url;
    // We always want to send JSON
    headers['Content-Type'] = 'application/json';
    
    let response = null;

    try {
        response = await fetch(URL, {
            method: 'POST',
            headers: headers,
            body: data
        });

        

        if (response) {
            if (response.status < 200 || response.status > 300) {
                throw new Error(`HTTP output module: Error sending data ${dataset} to ${URL}. ${response.status} ${response.statusText}`);
            } else {
                let jsonData = await response.text();
                jsonData = null;
            }

        }
    
    } catch (error) {
        window.PAUSEINPUTQUEUE = true;
        window.log("error", `HTTP output module: ${error}`);
        // Create a 8 digit random number to use as a retry ID
        if (!isRetry) {
            let retryID = Math.floor(10000000 + Math.random() * 90000000);
            retryQueue[dataset] = retryQueue[dataset] || {};
            retryQueue[dataset][retryID] = { count: 0, data: data, headers: headers, URL: URL, lastretry: Date.now() };
            window.log("info", `HTTP output module: Added ${dataset} to retry queue with ID ${retryID}`);
        }
    }
    return response;
}
