/*
Filter: Checksum 
Configuration: checksum: key or key.subkey where key is an object and subkey is the key to add the checksum to
Description: Create a sha-256 checksum for each record in the dataset, 
Add the checksum to the record as a new field.
*/
export async function filter(params, records) {
    // if params.checksum exists, and is a string, use it to create a checksum for each record
    if (params.checksum && typeof params.checksum === "string") {
        if (Array.isArray(records) && records.length > 0) {
            // For each record in records, create a checksum
            for (const record of records) {
                let recordAsString = JSON.stringify(record);
                let checksum = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(recordAsString));
                let checksumAsHex = Array.from(new Uint8Array(checksum)).map(b => b.toString(16).padStart(2, "0")).join("");
                // Add the checksum to the record but if the key is in dot notiation, we need to create the object+key
                let keyDepth = params.checksum.split(".");
                if (keyDepth.length > 1) {
                   let currentDepth = record;
                    for (let i = 0; i < keyDepth.length; i++) {
                       
                        if (i < keyDepth.length - 1) {
                            if (currentDepth[keyDepth[i]] && typeof currentDepth[keyDepth[i]] !== "object") {
                                window.log("error",`Filter plugin checksum: Invalid checksum path defined. ${[keyDepth[i]]} is not an object`)
                            }
                            currentDepth[keyDepth[i]] = currentDepth[keyDepth[i]] || {};
                            currentDepth = currentDepth[keyDepth[i]];
                       } else {
                            currentDepth[keyDepth[i]] = checksumAsHex;
                       }
                   }
                } else {
                    record[params.checksum] = record[params.checksum] || checksumAsHex;
                }

            }
            return records;
    

        } else {
            window.log ("warning",`Filter plugin checksum: No records to checksum`)
        }   
    }
}