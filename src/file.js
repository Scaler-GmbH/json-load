
import { TextLineStream } from "https://deno.land/std@0.179.0/streams/text_line_stream.ts";

/* A function to scan a directory recursively and return an array of files
    @method scanDirectory
    @param dir: The path to the directory to scan
    @return: An array of files
*/
async function scanDirectory(dir) {
    let files = [];
    try  {
    for await (const dirEntry of Deno.readDir(dir)) {
        const path = dir + "/" + dirEntry.name;
        if (dirEntry.isDirectory) {
            files = files.concat(await scanDirectory(path));
        } else {
            files.push(path);
        }
    }
    } catch (error) {
        console.error(`Error scanning directory ${dir}: ${error}`);
        console.error (`Please ensure this process has permission to read the directory and all sub-directories.`)
        Deno.exit(1);
    }
    return files;
}

/* A function to calculate the SHA256 hash of a file
    @method fileHash
    @param file: The path to the file to hash
    @return: The SHA256 hash of the file as a string
*/
async function fileHash(file) {

    //Open the file and read it into an array buffer
    try {

        const fileHandle = Deno.openSync(file, {
            read: true
        })
        
        let arrayBuffer = Deno.readFileSync(file);

        // Use the subtle crypto API to perform a SHA256 Sum of the file's Array Buffer
        // The resulting hash is stored in an array buffer
        const hashAsArrayBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);

        // To display it as a string we will get the hexadecimal value of each byte of the array buffer
        // This gets us an array where each byte of the array buffer becomes one item in the array
        const uint8ViewOfHash = new Uint8Array(hashAsArrayBuffer);
        // We then convert it to a regular array so we can convert each item to hexadecimal strings
        // Where to characters of 0-9 or a-f represent a number between 0 and 16, containing 4 bits of information, so 2 of them is 8 bits (1 byte).
        const hashAsString = Array.from(uint8ViewOfHash).map((b) => b.toString(16).padStart(2, '0')).join('');
        
        fileHandle.close();
        arrayBuffer = null;

        return hashAsString;
    } catch (error) {
        console.error(`Error hashing file ${file}: ${error}`);
        return false;
    }
}




/* 
    A function to load a gzipped JSON file into an array of JSON objects
    @method loadGzippedJSONFile
    @param file: The path to the file to load
    @return: An array of JSON objects
*/
async function loadGzippedJSONFile(file) {
    let arrOfJSON = [];
    try {
        const fileHandle = await Deno.open(file);

        const stream = fileHandle.readable
            .pipeThrough(new DecompressionStream("gzip"))
            .pipeThrough(new TextDecoderStream())
            .pipeThrough(new TextLineStream());
        const reader = stream.getReader();

        let done = 0;
        let linecount = 1;

        do {
            let line = await reader.read()
            if (line.done) { done = 1 }
            try {
                if (line.value) {
                    const lineValue = JSON.parse(line.value)
                    // if linevalue is an array, we need to push each item in the array
                    if (Array.isArray(lineValue)) {
                        arrOfJSON.push(...lineValue);
                    } else {
                        arrOfJSON.push(lineValue);
                    }
                }
            }
            catch (e) {
                console.debug(`Skipped line ${linecount} of file ${file} with value: ${line.value}`)
                // @todo: We need to emit the skipped record count as a metric
            }
            linecount++;
        } while (done < 1)

        fileHandle.close();
    } catch (error) {
        if (error.name != "BadResource") {
        console.error(`Error loading gzipped JSON file ${file}: ${error}`);
        }
        // @todo: add telemetry here
    }

    return arrOfJSON;

}

function sizeHumanReadabletoBytes(size) {
    let sizeBytes = 1024 * 1024;
    try {


        let sizeWithoutUnit = size.replace(/[^0-9]/g, '');
        if (size.toUpperCase().endsWith('KB')) {
            sizeBytes = parseInt(sizeWithoutUnit) * 1024;
        } else if (size.toUpperCase().endsWith('MB')) {
            sizeBytes = parseInt(sizeWithoutUnit) * 1024 * 1024;
        } else if (size.toUpperCase().endsWith('GB')) {
            sizeBytes = parseInt(sizeWithoutUnit) * 1024 * 1024 * 1024;
        } else {
            sizeBytes = parseInt(sizeWithoutUnit);
        }


    } catch (error) {
        console.log(`%cInvalid  size ${size} in the logging section of your config file, please use a valid size (e.g. 100KB, 1MB, 1GB)`, "color: red");
        console.log("Defaulting size to 1MB");

    }

    return sizeBytes;
}


export { loadGzippedJSONFile, scanDirectory, fileHash, sizeHumanReadabletoBytes };