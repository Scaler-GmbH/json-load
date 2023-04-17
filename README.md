# JSON Load

JSON Load is a simple [Deno](https://deno.land/) based tool for building a JSON based ETL pipeline with inspiration taken from [Vector](https://vector.dev/) and [Fluentbit](https://fluentbit.io) .

## Primary use case
JSON Load was primarily created to bulk load, transform, and ship gzipped JSON documents to a [Clickhouse](https://clickhouse.com/) OLAP database. When using the file input plugin, files already processed will not be processed again while newly arriving files will be queued for processing. JSON Load has a modular plugin system that enables users to rapidly develop inputs, filters (transformations), and outputs. 

## Core Features
- Supports input, filter, and output plugin modules
- Supports load once, output many
- Uses linux inotify to identify newly created files eligible for ingestion
- Can be configured to pace file ingestion as to not hit max open file limits.
- Supports chunking and queueing data
- Supports file hashing to mark previously ingested files (and basic de-duplication)
- Written in vanilla JS for the Deno runtime.

## Datasets
A dataset is a logical labeling of records that belong together and originate from the same source. An example of a dataset in JSON Load would be a set of log files from a singular process that are being written to a static location (/var/log/my-json-logs/*.json.gz) and read by JSON Load

## Inputs
Input modules are designed to consume JSON records for further processing (filtering) and routing (output). JSON Load ships with a singular input plugin designed to identify files in locally mounted paths which have not been previously loaded and processed.


### How to add your own Input plugins:
Each input plugin will be called on a per dataset basis. An input function must export a `start(dataset)` function and return an array of JSON records via `sendToFilters`

Here is a basic example:
```
import { sendToFilters } from "../../filter.js";
export async function start(dataset) {
 // Receive records for a particular dataset
 const myStaticRecords = [{foo:"bar},{bar:"foo"}]
 // Move them along to filters/transformation
 await sendToFilters(dataset, myStaticRecords);
}
```


## Filters
Filters are simple javasript functions that can manipulate each row/record of JSON data that was ingested. 

Filters can be chained together and will be called in the order that they are defined in the config file. 

|Filter | Description | Configuration | 
|-------|-------------|---------------|
|select |Select only specific JSON fields to send to the output plugin.| Useage:`select: ['key', 'key.subkey', 'key.subkey.subsubkey']` |
|drop | Drop specific JSON fields before sending to the output plugin.| Useage:`drop: ['key', 'key.subkey', 'key.subkey.subsubkey']`|
|replacevalue| Given a key, lookup the value and replace it with the new value.| Useage:`replacevalue: [{key: {"lookup": "newvalue", "lookup2": "newvalue2" , "lookup3": "newvalue3"}}, {key2.subkey: {"lookup": "newvalue", "lookup2": "newvalue2" , "lookup3": "newvalue3"}}]`|
|checksum | For each JSON row of data, create a sha-256 hash of the record and add it to a key. Useful for creating globally unique row ids/de-duping|  Useage: `checksum: "my_id"`|

### How to add your own filter plugins:
JSON Load supports creating your own filters. Just create a file in the `modules/filters` folder with at least one javascript function as follows:
```
export async function filter(params, records) {
    // Params contain the params defined in the config file.
    // Records containts the batch of JSON recards you want to modify

    for (const record of records) {
        record.foo="bar"
    }

    // Return the records to be sent along to the next filter or output plugin
    return records

}

```

## Outputs
Outputs are the final destination of your datasets and the output plugin determines where to send the finalized batch of JSON records.

Currently supported outputs are:
- file
- http
- clickhouse
- stdout
  
### How to add your own Output plugins:
JSON Load supports creating your own outputs. Save your output JS file to the modules/outputs folder . Each configured output plugin will receive records from the configured dataset as well as the name of the related dataset through the `emit` function.  To begin receiving records in your output plugin, implement the emit function and configure your plugin in the config.js file. 

Example output plugin:
```
export async function emit(dataset, data) {
    // Log the batch of data to the console
    console.log(data);
}
```

## Useage
Clone the repository and modify the config.js file to your desired setup. 

The following high level config options are available:
|key| Description | Required | Default | Options |
--------------------------------------------------
|flushIntervalMS | The minimum amount of time, in Miliseconds, to wait between sending chunks of data to the output modules | False | 10 | Any integer value |
|logging.file.level | The minimum logging level to log to file | false | INFO | DEBUG INFO WARNING ERROR |
|logging.file.path | The file system path of the log files | true | None | Any valid file system path |
|logging.file.maxBytes | The maximum size of a log file written by JSON Load | false | 10mb | Any human readable size such as 10kb, 10mb, 10gb |
|logging.file.maxBackupCount | The maximum number of log files to keep | false | 10 | Any integer value | 
|logging.file.format | The format of the log file output | false | default | default (syslog style) or json  | 
|logging.console.level | The minimum logging level for stdout logging | false | DEBUG | DEBUG INFO WARNING ERROR |
|logging.console.format | The format of the log file ouput | false | default | default (syslog style) or json  | 
|redis.hostname | The hostname or ip address of the redis server | true | None | Any valid host or ip as a String |
|redis.port | The TCP port of the redis server | true | 6379 | Any valid TCP port as an Integer | 
|redis.auth | The authentication string of the redis server | true | "" | Any valid authentication String |
|redis.db | The database number to use for JSON Log transactions | false | 0 | Any valid redis database number as an Integer |
|datasets.DATASET.inputs.file.readMaxNumberOfFiles | The maximum number of files to simultaneously when loading data | false | 50 | Any valid integer greater than 0 |
|datasets.DATASET.inputs.file.path | The folder which contains the files to be ingested. JSON Load will load all files recursively. | true | N/A | Any valid file system path as a strong. |
|datasets.DATASET.outputs.MODULE.chunkSize | Try to accumulate at least this much data before sending to the output plugin | false | 10mb | Any human readable size such as 10kb, 10mb, 10gb |
|datasets.DATASET.outputs.MODULE.flushIntervalMS | If this much time has passed (in miliseconds), and we have not yet called the output plugin, call it now. | false | 10 | Any valid integer value | 

## Configuring Datasets

Each dataset must be configured in the `config.js` file as  follows:

```
 datasets: {
        MY_CUSTOM_DATASET: {
            inputs: {
                file: {
                    readMaxNumberOfFiles: 150,
                    path: "/path/to/files/",
                }
            },
            outputs: {
                clickhouse: {
                    chunkSize: '150mb',
                    flushIntervalMS: 30000,
                    host: 'localhost',
                    port: 9000,
                    user: 'default',
                    password: 'abc123',
                    insertQuery: "INSERT INTO ..."
                },
                http: {
                    chunkSize: '300mb',
                    flushIntervalMS: 30000,
                    url: 'https://some-endpoint-that-accepts-json-as-a-post-body/',
                    headers: {
                        'Custome-Header': 'default',
                        
                    },
                    backlog: {
                        maxRetryCount: 5,
                        maxQueueSize: '1gb',
                    }
                }
            },
            filters: {
                select: ['jsonkey','some.subkey'],
            }
        },
    }
```

Please note that each output module shoud configureboth `chunkSize` and `flushIntervalMS` settings


## Running JSON Load

JSON Load can be compiled into a binary using Deno's compiling options or run using the Deno runtime as follows:
`deno run --allow-read --allow-write --allow-net --allow-env --allow-run jsonload.js --dataset=MY_CUSTOM_DATASET,MY_SECOND_DATASET`

## Dependencies
- A redis server is required. 
- Clickhouse client is required if using the clickhouse output module.
- Deno 1.32.4 or higher is recommended

## Limitations
- At this point in time JSON Load has only a single input plugin for ingesting GZipped JSON files. 

Where tools like [Vector](https://vector.dev/) and [Fluentbit](https://fluentbit.io) work well as general purpose observability pipelines for log files, and provide better performance than JSON Load, they suffer limitations when it comes to ignesting large amounts of files (versus tailing a small amount of rotating logs). If you are looking to build an observability pipeline vs an ETL pipeline, we suggest checking out the aforemention tools. 

