import config from './config.js';

let chunksForOutput = {};
let lastFlush = {};

async function sendToOutputs(dataset, records) {
    // determine what outputs are configured for this dataset
    // for each output, prepare and send the records to the chunker
    // the chunker will be responsible for batching and managing flight ready status.

    // determine what outputs are configured for this dataset
    if (!config.datasets[dataset]) {
        window.log("error", `No dataset ${dataset} found in config`);
        return;
    }

    if (!config.datasets[dataset].outputs) {
        window.log("error",`No outputs configured for dataset ${dataset}, please update your config file to include at least one output.`);
        return;
    }
    let outputs = config.datasets[dataset].outputs;

    // for each output, prepare send the data to the chunker
    for (const [output, outputConfig] of Object.entries(outputs)) {
        // Set a default chunk size if none is specified
        outputConfig.chunkSize = outputConfig.chunkSize || "10MB";
        const chunkSizeSettingKiloBytes = chunkSizeHumanReadabletoChunkSizeBytes(outputConfig.chunkSize);
        const flushIntervalMS = outputConfig.flushIntervalMS || 1000;
        chunker(dataset, records, output, chunkSizeSettingKiloBytes, outputConfig.maxRecords, flushIntervalMS);
    }

}

async function chunker(dataset, records, output, chunkSize = 1000, maxRecords = 100000 , flushIntervalMS = 1000) {

    window.log("debug",`Chunking ${records.length} records for dataset ${dataset} to output ${output} with chunk size ${chunkSize}kb and max records ${maxRecords}`)

    const newRecordSize = getSizeInKB(records);
    chunksForOutput[dataset] = chunksForOutput[dataset] || {};
    chunksForOutput[dataset][output] = chunksForOutput[dataset][output] || {};
    chunksForOutput[dataset][output].data = chunksForOutput[dataset][output].data || [];
    chunksForOutput[dataset][output].queueSize = chunksForOutput[dataset][output].queueSize || 0;

    const currentQueueSize = chunksForOutput[dataset][output].queueSize
    lastFlush[dataset] = lastFlush[dataset] || {};
    lastFlush[dataset][output] = lastFlush[dataset][output] || 0;
    const lastFlushTime = lastFlush[dataset][output] || 0;
    // Timestamp in milliseconds
    const currentTime = new Date().getTime();
    const timeToFlush = ((flushIntervalMS + lastFlushTime) < currentTime);
    
    if (timeToFlush) {
        window.log("warning",`Marking ${chunksForOutput[dataset][output].data.length} records to output ${output} for dataset ${dataset} as flight ready due to flush interval`);
    }

    if (currentQueueSize + newRecordSize > chunkSize || chunksForOutput[dataset][output].data.length >= maxRecords || timeToFlush ) {
        window.log("debug",`Marking ${chunksForOutput[dataset][output].data.length} records to output ${output} for dataset ${dataset} as flight ready`);
        // The concept of flight ready is that the output module has enough data to send to the output. 
        // It does not guarantee that the data will always be less than maxRecords or chunkSize, but 
        // it does guarantee that the output module will send the data to the output as soon as it is ready.
        chunksForOutput[dataset][output]['flightready'] = true;
    } else {
        chunksForOutput[dataset][output]['flightready'] = false;
    }

    // This causes data to be duplicated in memory for each output module. This is not ideal but 
    // allows for each output module to have its own queue. It is common for output modules to have
    // different abilities to process data. For example, one output module may be able to send data
    // much quicker than another, or, another output module may be returning errors that need to be
    // handled differently. This is a tradeoff between memory, flexibility, and performance.
    // There is certainly a more elegant way to do this, but this is a good starting point.
    chunksForOutput[dataset][output].data.push(...records);
    chunksForOutput[dataset][output].queueSize += newRecordSize;
    const currentPendingQueueSize = chunksForOutput[dataset][output].queueSize / 1024;

    window.log("debug",`Current queue size for output ${output} for dataset ${dataset} is ${currentPendingQueueSize.toPrecision(3)}MB`);
}

/* Given a chunk size in human readable format (e.g. 100KB, 1MB, 1GB), convert it to a number of kilobytes 
    @method chunkSizeHumanReadabletoChunkSizeBytes
    @param {string} chunkSize - The chunk size in human readable format (e.g. 100KB, 1MB, 1GB)
    @return {number} The chunk size in kilobytes
*/
function chunkSizeHumanReadabletoChunkSizeBytes(chunkSize) {
    let chunkSizeKiloBytes = 1024 * 1024;
    try {


        let chunkSizeWithoutUnit = chunkSize.replace(/[^0-9]/g, '');
        if (chunkSize.toUpperCase().endsWith('KB')) {
            chunkSizeKiloBytes = parseInt(chunkSizeWithoutUnit) * 1024;
        } else if (chunkSize.toUpperCase().endsWith('MB')) {
            chunkSizeKiloBytes = parseInt(chunkSizeWithoutUnit) * 1024 * 1024;
        } else if (chunkSize.toUpperCase().endsWith('GB')) {
            chunkSizeKiloBytes = parseInt(chunkSizeWithoutUnit) * 1024 * 1024 * 1024;
        } else {
            chunkSizeKiloBytes = parseInt(chunkSizeWithoutUnit);
        }


    } catch (error) {
        window.log("error", `Invalid chunk size ${chunkSize} in your config file, please use a valid chunk size (e.g. 100KB, 1MB, 1GB). Defaulting chunk size to 1MB`);
    }

    return chunkSizeKiloBytes / 1024;
}

function getSizeInKB(obj) {
    let json = JSON.stringify(obj);
    let bytes = new TextEncoder().encode(json).length;
    let kilobytes = bytes / 1024;
    json=null;
    return kilobytes;
}

let queueIsRunning = {};


/* This function is responsible for processing the output queue. It will check each output module to see if it is flight ready.
    If it is flight ready, it will send the data to the output module and mark the output module as not flight ready.
    @method processOutputQueue
    @param {object} loadedOutputModules - The output modules that have been loaded
*/
async function processOutputQueue(dataset, module, emit) {

    queueIsRunning[dataset] = queueIsRunning[dataset] || false;
    if (queueIsRunning[dataset] == false && window.PAUSEINPUTQUEUE == false) {
        queueIsRunning[dataset] = true;

        if (chunksForOutput[dataset] && chunksForOutput[dataset][module]) {

        let outputConfig = chunksForOutput[dataset][module];

        window.log("debug",`Processing output queue for dataset ${dataset} in module ${module}`)
            window.log("debug",`Current queue size for dataset ${dataset} in module ${module} is ${getSizeInKB(outputConfig.queueSize)}KB`)

        if (outputConfig.flightready) {
            if (outputConfig.data.length > 0) {
                chunksForOutput[dataset][module].flightready = false;

                // Slice the data from the queue and send it to the output module.
                const dataToSend = outputConfig.data.splice(0, outputConfig.data.length);
                chunksForOutput[dataset][module].queueSize = getSizeInKB(outputConfig.data);

                window.log("debug",`Sending ${dataToSend.length} records to module ${module} for dataset ${dataset}`);
                // Check if the output module is loaded
                if (!module) {
                    window.log("critical",`Tried to send data to non-existing output module ${module}, please ensure the module exists.`);
                    Deno.exit(1);
                }
                emit(dataset, dataToSend);
                // Current timestamp in milliseconds
                const now = new Date().getTime();
                lastFlush[dataset] = lastFlush[dataset] || {};
                lastFlush[dataset][module] = now;

            }
        }
        } 

        queueIsRunning[dataset] = false;
    } else {
        if (window.PAUSEINPUTQUEUE == true) {
            window.log("warning",`Output queue is pausing due to downstream signal, not processing output queue for dataset ${dataset} in module ${module}`);
        }
    }

    let outputFlushInterval = config.flushIntervalMS || 10;

    setTimeout(() => {
        processOutputQueue(dataset, module, emit);
    }, outputFlushInterval);

}

export { sendToOutputs, processOutputQueue, chunkSizeHumanReadabletoChunkSizeBytes, getSizeInKB };