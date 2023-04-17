/*
Filter: Addkeyvalue 
Configuration: A string containing 'key=value' or 'key.subkey=value'
Description: Ads a key value pair to each record. 
Add the checksum to the record as a new field.
*/
export async function filter(params, records) {
    // if params.checksum exists, and is a string, use it to create a checksum for each record
    if (params.addkeyvalue && typeof params.addkeyvalue === "string") {
        if (Array.isArray(records) && records.length > 0) {
            // For each record in records, create a checksum
            for (const record of records) {
                let recordAsString = JSON.stringify(record);
                let valueToAdd = params.addkeyvalue.split("=")[1] || "";
                let keyToAdd = params.addkeyvalue.split("=")[0] || "addedKey";
                // Add the checksum to the record but if the key is in dot notiation, we need to create the object+key
                let keyDepth = keyToAdd.split(".");
                if (keyDepth.length > 1) {
                    let currentDepth = record;
                    for (let i = 0; i < keyDepth.length; i++) {

                        if (i < keyDepth.length - 1) {
                            if (currentDepth[keyDepth[i]] && typeof currentDepth[keyDepth[i]] !== "object") {
                                window.log("error",`Invalid key path defined in addkeyvalue filter plugin. ${[keyDepth[i]]} is not an object`)
                            }
                            currentDepth[keyDepth[i]] = currentDepth[keyDepth[i]] || {};
                            currentDepth = currentDepth[keyDepth[i]];
                        } else {
                            currentDepth[keyDepth[i]] = valueToAdd;
                        }
                    }
                } else {
                    record[valueToAdd] = record[valueToAdd] || checksumAsHex;
                }

            }
            return records;


        } else {
            window.log("warning",`Filter plugin addkeyvalue: No records to add a key/value to.`)
        }
    }
}