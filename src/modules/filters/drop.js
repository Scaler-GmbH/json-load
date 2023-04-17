/*
Filter: Drop 
Description: Drops a subset of records based on an array of keys. 
Child keys are supported using dot notation. For example, if you want 
to drop records where the key "foo.bar" corresponds to the bar property of foo.
*/

export async function filter(params, records) {
    // if params.drop exists, and is an array, use it to drop the specified keys from the records
    if (params.drop && Array.isArray(params.drop)) {
        if (Array.isArray(records) && records.length > 0) {
        let droppedRecords = [];
        for (const record of records) {
            let droppedRecord = Object.assign({}, record);
            for (const key of params.drop) {
                let value = droppedRecord;
                let subkeys = key.split(".");
                let lastSubkey = subkeys.pop();
                for (const subkey of subkeys) {
                    value = value[subkey];
                }
                delete value[lastSubkey];
            }
            droppedRecords.push(droppedRecord);
        }
        return droppedRecords;
    } else {
        window.log ("warning",`Filter plugin drop: No records to drop from`)
    } 
    } else {
        window.log ("error",`Invalid drop configuration defined, please check your config file`)
    }

}