import config from "../../config.js";


export async function emit(dataset, data) {
    const clickhouseUser = config.datasets[dataset].outputs.clickhouse.user || "default";
    const clickhousePassword = config.datasets[dataset].outputs.clickhouse.password || "";
    const clickhouseHost = config.datasets[dataset].outputs.clickhouse.host || "localhost";
    const clickhouseInsertQuery = config.datasets[dataset].outputs.clickhouse.insertQuery || '';
    const clickhousePort = config.datasets[dataset].outputs.clickhouse.port || 9000;

    // a random number between 10000 and 99999
    let random = Math.floor(Math.random() * 90000) + 10000;

    // Create a temporary file to write the data to. First check if the temp directory exists, if not, create it
    let tmpDir = `temp/${dataset}`;
    try {
        await Deno.stat(tmpDir);
    } catch (err) {
        await Deno.mkdir(tmpDir, { recursive: true });
    }
    
    let filename = `${tmpDir}/tmp-load-${random}.json`;

    let enc = new TextEncoder();
    let fileHandle = await Deno.open(filename, { create: true, write: true });
    window.log("debug", `Emitting ${dataset} with ${data.length} rows to ClickHouse`);
    // For each record in data
    let dataToWrite = '';
    for (let record of data) {
    // Write the record to the file
        dataToWrite += JSON.stringify(record) + '\n';
    }
    await Deno.writeAll(fileHandle, enc.encode((dataToWrite)));
    // Close the file
    await fileHandle.close();

    data = null;
    dataToWrite = null;
    enc = null;
    random = null;

    window.log ("warning", `Writing to temporary file ${filename} complete. Now writing to ClickHouse.`)

    const command = `cat '${filename}' | clickhouse client --host ${clickhouseHost} --port ${clickhousePort} --user ${clickhouseUser} --password ${clickhousePassword} --query "${clickhouseInsertQuery}"`

    const p = Deno.run({
        cmd: ["bash"],
        stdout: "piped",
        stdin: "piped"
    });

    let encoder = new TextEncoder();
    let decoder = new TextDecoder();


    await p.stdin.write(encoder.encode(command));

    await p.stdin.close();
    const output = await p.output()
    p.close();

    console.log (decoder.decode(output));
    encoder = null;
    decoder = null;

    // Delete the file
    await Deno.remove(filename);


}
