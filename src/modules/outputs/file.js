
import { ensureDirSync } from "https://deno.land/std@0.170.0/fs/mod.ts";
import { scanDirectory } from "../../file.js";
import { chunkSizeHumanReadabletoChunkSizeBytes, getSizeInKB } from "../../outqueue.js";
import config from '../../config.js';


/* Given a base path, return the file handle of the currenet file in the sequence
    @method filenameBySequenceNumber
    @param basePath: The base path to the directory where the files are stored
    @param dataset: The name of the dataset
    @return: The filehandle of the current file in the sequence
*/
async function filenameBySequenceNumber(basePath, dataset) {
    // Given a base path, return the next filename in the sequence
    // If the directory does not exist,  start with 000001
    // If the directory exists, find the highest sequence number and increment it by 1
    let filename = '';
    const date = new Date();
    // Check to see if the directory exists, if not, create it
    await ensureDirSync(basePath);

    // Get a list of files in the directory
    const filesInBasePath = await scanDirectory(basePath, dataset);
    const startOfSequenceNumber = 1;

    // If there are no files in the directory, start with 000001
    if (filesInBasePath.length == 0) {

        filename = `${basePath}/${dataset}_${date.getHours()}_000001.json`;
        window.log("debug",`No files found in ${basePath}. Starting with ${filename}`);
        // If there are files in the directory, find the highest sequence number and increment it by 1
    } else {
        // Find the highest sequence number
        let highestSequenceNumber = 1;
        for (const file of filesInBasePath) {
            let sequenceNumber = 1;
            // Get the sequence number from the filename by getting everything aftert the second underscore to the first period
            try {
                // A regex to get the sequence number from the filenames
                const regex = new RegExp(`^.*${dataset}_[0-9]{2}_(\\d{6}).json$`);
                sequenceNumber = parseInt(file.match(regex)[1]);

            } catch (err) {
                window.log("warning",`Error parsing sequence number from file ${file}. Skipping.`);
                continue;
            }

            if (sequenceNumber > highestSequenceNumber) {
                highestSequenceNumber = sequenceNumber;
            }
        }

        // Check the size of the file with the highest sequence number
        // If the file is larger than the configured chunkSize, increment the sequence number by 1
        // If the file is smaller than the configured chunkSize, use the same sequence number
        filename = `${basePath}/${dataset}_${date.getHours()}_${highestSequenceNumber.toString().padStart(6, "0")}.json`;

        let highestSequenceNumberFileSize = 0;
        try {
            highestSequenceNumberFileSize = await Deno.statSync(filename).size;

        } catch (err) {
            window.log("debug",`File ${filename} is new.`);
        }
        let fileSizeinKB = (highestSequenceNumberFileSize / 1024).toFixed(2);
        let chunkSizeinKB = chunkSizeHumanReadabletoChunkSizeBytes(config.datasets[dataset].outputs.file.chunkSize).toFixed(2);
        if (fileSizeinKB > chunkSizeinKB) {
            window.log("debug",`File ${filename} is larger than the configured chunk size. Incrementing sequence number by 1`)
            highestSequenceNumber += 1;
            filename = `${basePath}/${dataset}_${date.getHours()}_${highestSequenceNumber.toString().padStart(6, "0")}.json`;
        }

    }
    return filename;

}

export async function emit(dataset, data) {
    window.log("debug","Emitting data to file");
    // Write data to a file in the output directory specified in the configuration. 
    //Chunk files by size or number of records, meaning we keep the file open for 
    // writing until we reach the limit, then close it and open a new one
    // Name the file with the dataset name, the date, and a sequence number.
    // Determine the filename
    let date = new Date();
    let basePath = config.datasets[dataset].outputs.file.path;

    // If there is no trailling slash, add one
    if (!basePath.endsWith("/")) {
        basePath += "/";
    }

    // Add the current date to the path as a subfolder
    basePath = `${basePath}/${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;


    // Check to see if the directory exists, if not, create it
    const filename = await filenameBySequenceNumber(basePath, dataset);

    let writeableData = ''
    let fileHandle = '';

    try {
        //  For each record, write it to the file
        for (let record of data) {
            record = JSON.stringify(record) || '';
            //add a new line character to record
            record += '\n';
            writeableData += record;

        }
        fileHandle = await Deno.writeTextFileSync(filename, writeableData, { create: true, append: true });

    } catch (err) {
        window.log("error",`Error writing to file ${filename}. ${err}`);
    }

    // Close the file
    if (fileHandle) {
        fileHandle.close();
        let dataSizeinMB = getSizeInKB(data) / 1024;
        window.log("debug",'Wrote ' + data.length + ' records to file ' + filename + ' (' + dataSizeinMB.toFixed(2) + ' MB).');
    }
}

