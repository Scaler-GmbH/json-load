import { getFilesFromQueue, isFileAlreadyProccessed, addFileToQueue, markFileAsProcessed } from "./redis.js";
import { loadGzippedJSONFile, fileHash, scanDirectory } from "./file.js";
import { sendToOutputs } from "./outqueue.js";
import config from "./config.js";

let queueIsRunning = false;


async function checkForMissedFiles(dataset) {
    // Check for files that were missed by the filesystem watcher
    const folder = config.datasets[dataset].path;
    window.log("info",`Scanning ${folder} for missed files`)
    let files = await scanDirectory(folder);
    let eligibleFiles = files.filter(file => file.endsWith('.json.gz'));
    window.log("info",`Found ${eligibleFiles.length} files while scanning ${folder}`);
    for (let file of eligibleFiles) {
        addFileToQueue(dataset, file);
    }

}

async function processQueue(dataset) {
    if (!queueIsRunning) {

        queueIsRunning = true;
        const files = await getFilesFromQueue(dataset, config.process_max_number_of_files);

        if (files.length > 0) {
            window.log("debug",`Processing queue for dataset ${dataset}`);
            window.log("debug",`Found ${files.length} files in queue`)
        }

        for (let file of files) {
            window.log("debug", `Processing file ${file}`);

            const records = await loadGzippedJSONFile(file);
            window.log("debug", `Found ${records.length} valid records in file ${file}`);
            // todo: Pass the file hash to the output modules and track the file as being processed per output.
            await sendToOutputs(dataset, records);
            markFileAsProcessed(dataset, file);
        }
        if (files.length > 0) {
            window.log("debug", `Finished processing queue for dataset ${dataset}, waiting for new files...`)
        }

        queueIsRunning = false;
    } else {
        window.log("debug", "Queue is already running");
    }
    setTimeout(() => {
        processQueue(dataset)
    }, 100);
}

export { processQueue, checkForMissedFiles }