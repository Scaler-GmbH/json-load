/*
Filter: Replacevalue 
Configuration: [{key: {"lookup": "newvalue", "lookup2": "newvalue2" , "lookup3": "newvalue3"}}, {key2.subkey: {"lookup": "newvalue", "lookup2": "newvalue2" , "lookup3": "newvalue3"}}]
Description: Given a key, lookup the value and replace it with the new value.
Add the checksum to the record as a new field.
*/
export async function filter(params, records) {
    // Check if params.replacevalue exists, and is an array
    if (params.replacevalue && Array.isArray(params.replacevalue)) {
        if (Array.isArray(records) && records.length > 0) {
            // For each record in records, create a checksum
            for (const record of records) {
                for (const replace of params.replacevalue) {
                    let key = Object.keys(replace)[0];
                    let value = record;
                    let keyDepth = key.split(".");
                    for (let i = 0; i < keyDepth.length; i++) {
                        if (i < keyDepth.length - 1) {
                            if (value[keyDepth[i]] && typeof value[keyDepth[i]] !== "object") {
                                window.log("error",`Filter plugin replacevalue: Invalid key path defined. ${[keyDepth[i]]} is not an object`)
                            }
                            value = value[keyDepth[i]] || {};
                        } else {
                            if (replace[key][value[keyDepth[i]]]) {
                                value[keyDepth[i]] = replace[key][value[keyDepth[i]]];
                            }
                        }
                    }
                }
            }
            
            return records;
        } else {
            window.log("warning",`No records to replace values in.`)
        }
    }
}