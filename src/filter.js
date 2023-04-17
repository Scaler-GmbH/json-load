import { sendToOutputs } from "./outqueue.js";
import config from "./config.js";

export async function sendToFilters(dataset, records) {
    window.log("debug","Sending records to filters");
    // For each defined filter, send the data to the filter in order
    if (!config.datasets[dataset].filters) {
        window.log("warning",`No filters defined for dataset ${dataset}, sending data to outputs, are you sure meant to do this?`);

    } else {
        for (const filter of Object.keys(config.datasets[dataset].filters)) {
            if (!window.availableFilters[filter]) {
                window.log("critical", `Tried to load non-existing filter plugin module \`${filter}\` , please ensure the module exists and ensure filters_modules_path is defined in your config. `);
                Deno.exit(1);
            }
            let recordLength = (records) ? records.length : 0;
            window.log("debug", `Sending ${recordLength} records to filter ${filter}`);
            records = await window.availableFilters[filter](config.datasets[dataset].filters, records);
        }
    }
    // Send the data to the outputs
    sendToOutputs(dataset, records);
}