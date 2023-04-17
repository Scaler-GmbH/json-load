
import { parse } from "https://deno.land/std@0.175.0/flags/mod.ts";

import { connectToRedis } from "./redis.js";
import { loadModules } from "./modules/index.js";
import { processOutputQueue } from "./outqueue.js";
import { startLogger } from "./logging.js";
import config from "./config.js";


window.log = await startLogger();
window.PAUSEINPUTQUEUE = false;

// Command line arguments
const flags = parse(Deno.args, {
    boolean: ["help", "reset-history"],
    string: ["dataset"],
    default: { color: true },
});

// If help is requested, print the help message and exit
if (flags.help) {
    console.log("Usage: deno run --allow-read --allow-write --allow-net --allow-env --allow-run jsonload.js --dataset=MY_CUSTOM_DATASET,MY_SECOND_DATASET");
    Deno.exit(0);
}

// If no dataset is specified, print the help message and exit
if (!flags.dataset) {
    window.log("critical", 'No dataset specified. Please specify a dataset to process using the --dataset flag.');
    window.log("critical", "Usage: deno run --allow-read --allow-write --allow-net --allow-env --allow-run jsonload.js --dataset=MY_CUSTOM_DATASET,MY_SECOND_DATASET");
    Deno.exit(1);
} else {

    window.SIGNAL = {} // Used to stop the input queue


    // Load our output plugins and start our output queue
    let availableOutputs = await loadModules('outputs');

    // Load our filter plugins. These will be globals.
    window.availableFilters = await loadModules('filters');

    // Load our input plugins.
    let availableInputs = await loadModules('inputs');

    // Connect to redis
    await connectToRedis();


    // If a dataset is specified, split it into an array
    const datasets = flags.dataset.split(',');


    // Check if the dataset is valid by checking if it is in the config file
    for (let dataset of datasets) {
        if (!config.datasets[dataset]) {
            window.log("critical", `Invalid dataset ${dataset}. Please ensure it is in your config.js file and specify a valid dataset using the --dataset flag.`);
            window.log("critical", "Usage: deno run --allow-read --allow-write --allow-net --allow-env --allow-run jsonload.js --dataset=MY_CUSTOM_DATASET,MY_SECOND_DATASET");
            Deno.exit(1);
        }
        // Start the output queue for each dataset
        for (let output of Object.keys(config.datasets[dataset].outputs)) {
            window.log("info", `Starting output queue for dataset ${dataset} and output ${output}`)
            processOutputQueue(dataset, output, availableOutputs[output]);
        }

        // Start the input queue for each dataset
        for (let input of Object.keys(config.datasets[dataset].inputs)) {
            window.log("info", `Starting inputs for dataset ${dataset} and input ${input}`)
            window.log("debug", JSON.stringify(availableInputs))
            availableInputs[input](dataset);
        }


    }

    window.log("info", "Processing started");






}



