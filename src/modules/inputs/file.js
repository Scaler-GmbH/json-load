
import config from "../../config.js";
import { connectToRedis } from "../../redis.js";
import { loadGzippedJSONFile, fileHash, scanDirectory } from "../../file.js";
import { sendToFilters } from "../../filter.js";

let redis = null;

/* A function to check if a file has already been processed
    @method isFileAlreadyProccessed
    @param file: The path to the file to check
    @return: True if the file has already been processed, false otherwise
*/
async function isFileAlreadyProccessed(dataset, file) {
    if (!redis) {
        redis = await connectToRedis();
    }
    let hash = await fileHash(file);
    let result = await redis.zscore(`jsonload_processed_${dataset}`, hash);
    return (result != null);
}

/* A function to mark a file as processed in the redis zset
    @method markFileAsProcessed
    @param file: The path to the file to mark as processed
    @return: None
*/
async function markFileAsProcessed(dataset, file) {
    if (!redis) {
        redis = await connectToRedis();
    }
    window.log("debug", `Marking file as processed ${file}`)
    // The current timestamp in miliseconds
    const timestamp = Date.now();
    let hash = await fileHash(file);
    // Add the file to the processed queue
    redis.zadd(`jsonload_processed_${dataset}`, timestamp, hash, "GT");
}

/*
   A function to add a newly discovered file to the redis queue
   for processing.
   @method addFileToQueue
   @param file: The path to the file to add to the queue
   @return: None
*/
async function addFileToQueue(dataset, file) {
    if (!redis) {
        redis = await connectToRedis();
    }
    if (!await isFileAlreadyProccessed(dataset, file)) {
        //window.log("debug", `Adding file to redis queue ${file}`)
        // The current timestamp in miliseconds
        const timestamp = Date.now();
        // Add the file to the queue
        await redis.zadd(`jsonload_preprocess_${dataset}`, timestamp, file, "NX");
    } else {
        window.log("debug", `File ${file} has already been processed, skipping`);
    }
}


/*
 A function to get a list of files (FIFO) from the redis zset. 
 The score of the zset is the timestamp of when the file was added to the queue.
    @method getFilesFromQueue
    @param count: The number of files to return
    @return: An array of files
*/
async function getFilesFromQueue(dataset, count) {
    if (!redis) {
        redis = await connectToRedis();
    }
    // get the number of files in the queue
    const queueLength = await redis.zcard(`jsonload_preprocess_${dataset}`);

    if (queueLength > 0) {
        window.log("debug", `${dataset} has ${queueLength} files waiting to process`)
    }

    // If the count is greater than the number of files in the queue, set the count to the number of files in the queue
    if (count > queueLength) {
        count = queueLength;
    }
    const files = await redis.zpopmin(`jsonload_preprocess_${dataset}`, count);

    let filesWithoutScores = [];
    //Filter all items from the array that contain only numbers (a score)
    filesWithoutScores = files.filter((item) => {
        return !/^\d+$/.test(item);
    });

    return filesWithoutScores;
}

/*
    A filesystem watcher to look for newly created files in the filesystem.
*/
async function fsWatcher(dataset) {
    // Determine the path to watch based on the dataset
    const path = config.datasets[dataset].inputs.file.path || '';
    const fileExtension = config.datasets[dataset].inputs.file.fileExtension || '.json.gz';

    if (path == '') {
        window.log("critical", `No path value in the file input plugin specified for dataset ${dataset}`);
        Deno.exit(1);
    }

    let newwatch;
    try {
        newwatch = Deno.watchFs(path)
    } catch (error) {
        window.log("critical", `Error watching ${dataset} in path ${path}: ${error}`);
        Deno.exit(1);
    }

    window.log("debug", "Spawned new watcher id", JSON.stringify(newwatch.rid));
    for await (const event of newwatch) {

        if (event.kind == 'modify' || event.kind == "access" || event.kind == "create") {

            for (let path of event.paths) {
                if (path.endsWith(fileExtension)) {
                    window.log("debug", `Found file ${path}`);
                    await addFileToQueue(dataset, path);
                }
            }
        }
    }
}



async function checkForMissedFiles(dataset) {
    // Check for files that were missed by the filesystem watcher
    const folder = config.datasets[dataset].inputs.file.path || '';
    const fileExtension = config.datasets[dataset].inputs.file.fileExtension || '.json.gz';

    if (folder == '') {
        window.log("critical", `No path value in the file input plugin specified for dataset ${dataset}`);
        Deno.exit(1);
    }

    window.log("info", `Scanning ${folder} for missed files`)
    let files = await scanDirectory(folder);
    let eligibleFiles = files.filter(file => file.endsWith(fileExtension));
    window.log("info", `Found ${eligibleFiles.length} files while scanning ${folder}`);

    // Add the files to the queue in batches of 500
    // distributeTasks(dataset, eligibleFiles, addFileToQueue, 2500);
    for (let file of eligibleFiles) {
        await addFileToQueue(dataset, file);
    }

}

let queueIsRunning = {};

async function loadAndProcessFile(dataset, file) {

    window.log("debug", `Processing file ${file}`);

    const records = await loadGzippedJSONFile(file);
    window.log("debug", `Found ${records.length} valid records in file ${file}`);
    // todo: Pass the file hash to the output modules and track the file as being processed per output.
    await sendToFilters(dataset, records);
    markFileAsProcessed(dataset, file);

}

async function processQueue(dataset) {
    queueIsRunning[dataset] = queueIsRunning[dataset] || false;

    if (queueIsRunning[dataset] == false && window.PAUSEINPUTQUEUE == false) {
        queueIsRunning[dataset] = true;

       
        let maxFiles = config.datasets[dataset].inputs.file.readMaxNumberOfFiles || 50;
        const files = await getFilesFromQueue(dataset, maxFiles);
        window.log("debug", `Found ${files.length} files in queue`)
        if (files.length > 0) {
            window.log("debug", `Processing queue for dataset ${dataset}`);
            window.log("debug", `Found ${files.length} files in queue`)
        }


        for (let file of files) {
            await loadAndProcessFile(dataset, file);
        }

        if (files.length > 0) {
            window.log("debug", `Finished processing queue for dataset ${dataset}, waiting for new files...`)
        }

        queueIsRunning[dataset] = false;
    } else {
        if (window.PAUSEINPUTQUEUE) {
            // Pace how often we log the pause message
            if (Math.random() < 0.05) {
                window.log("error", "Input queue received pause signal from the output queue")
            }
        } else {
            // Pace how often we log the  message
            if (Math.random() < 0.05) {
            window.log("debug", `Queue ${dataset} is already running`);
            }
        }
    }
    setTimeout(() => {
        processQueue(dataset)
    }, 100);
}


export async function start(dataset) {
    // Start the jsonload filesystem watcher for each dataset
    fsWatcher(dataset);

    // First check for missed files
    checkForMissedFiles(dataset);

    // Start the task manager for each dataset
    processQueue(dataset);
}