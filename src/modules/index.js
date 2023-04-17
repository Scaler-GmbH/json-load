
import config from '../config.js';


let modules = {
    'outputs': {},
    'filters': {},
    'inputs': {}
};
let modulesPathMap = {
    'outputs': 'outputs_modules_path',
    'filters': 'filters_modules_path',
    'inputs': 'inputs_modules_path'
}


async function loadModules(type = 'outputs') {


    const modules_path = config[modulesPathMap[type]] || `${Deno.cwd()}/modules/${type}`;

    // If modules_path has a trailing slash, remove it
    if (modules_path.endsWith('/')) {
        modules_path = modules_path.slice(0, -1);
    }

    if (Object.keys(config.datasets).length > 0) {
        for (const [dataset, datasetConfig] of Object.entries(config.datasets)) {
            if (datasetConfig[type]) {
                for (const [plugin, outputConfig] of Object.entries(datasetConfig[type])) {
                    if (modules[type][plugin]) {
                    } else {
                        try {
                            let moduleName = `${modules_path}/${plugin}.js`;
                            if (type == 'outputs') {
                                modules[type][plugin] = (await import(moduleName)).emit
                            } else if (type == 'filters') {
                                modules[type][plugin] = (await import(moduleName)).filter
                            } else if (type == 'inputs') {
                                modules[type][plugin] = (await import(moduleName)).start
                            }

                        } catch (error) {
                            window.log("critical",`Critical Error. Tried to load non-existing ${type} plugin module \`${moduleName}\` , please ensure the module exists and ensure ${modulesPathMap[type]} is defined in your config. `);
                            Deno.exit(1);
                        }
                        window.log("info",`Loaded plugin ${type} module ${plugin}`);

                    }
                }
            } else {
                window.log("error",`%cNo ${type} defined for dataset ${dataset}, are you sure meant to do this?`)
            }
        }
        window.log ("info",`Loaded ${Object.keys(modules[type]).length} ${type} modules`);
        return modules[type];
    }

}
export { loadModules };
