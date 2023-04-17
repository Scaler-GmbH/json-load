let config = {
    flushIntervalMS: 10,
    logging: {
        file: {
            level: "WARNING",
            path: "/var/log/jsonload/",
            maxBytes: '50mb',
            maxBackupCount: 10,
            format: "default"
        },
        console: {
            level: "DEBUG",
            format: "default"
        }
    },
    redis: {
        hostname: "127.0.0.1",
        port: 6379,
        auth: "",
        db: 0,
    },
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

}

export default config;