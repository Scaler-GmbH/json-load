/*
Filter: Select
Configuration: select: [key, key.subkey, key.subkey.subsubkey]
Description: Selects a subset of records based on an array of keys. 
Child keys are supported using dot notation. For example, if you want 
to select records where the key "foo.bar" corresponds to the bar property of foo.
*/

export async function filter(params, records) {
    window.log("debug",`Selecting records with params ${params.select.join(',')}`)
    //if params.selection exists, and is an array, use it to select records
    if (params.select && Array.isArray(params.select)) {
        if (Array.isArray(records) && records.length > 0) {
        let selectedRecords = [];
        for (const record of records) {
            let selectedRecord = {};
            for (const key of params.select) {
                let value = record;
                let keyexists = true;
                for (const subkey of key.split(".")) {
                    
                    if (value[subkey]) {
                    value = value[subkey]
                    } else {
                        keyexists = false
                    };
                }
                if (keyexists){
                selectedRecord[key] = value;
                }
            }
            selectedRecords.push(selectedRecord);
        }
        return selectedRecords;
    } else {
        window.log ("warning",`Filter plugin select: No records to select from`)
    }
    } else {
        window.log ("error",`Filter plugin select: Invalid select configuration defined, please check your config file`)
}
}