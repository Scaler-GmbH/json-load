import config from "./config.js";
import { addFileToQueue } from "./redis.js";

/*
    A filesystem watcher to look for newly created files in the filesystem.
*/
export async function fsWatcher(dataset) {
    // Determine the path to watch based on the dataset
    const path = config.datasets[dataset].path;
    let newwatch;
    try {
         newwatch = Deno.watchFs(path)
    } catch (error) {
        window.log("critical",`Error watching ${dataset} in path ${path}: ${error}`);
        Deno.exit(1);
    }
   
    window.log("info","Spawned new watcher id", JSON.stringify(newwatch.rid));
    for await (const event of newwatch) {

        if (event.kind == 'modify' || event.kind == "access" || event.kind == "create") {

            for (let path of event.paths) {
                if (path.endsWith('.json.gz')) {
                    window.log("debug", `Found file ${path}`);
                    await addFileToQueue(dataset, path);
                }
            }
        }
    }
}