import util from "../util/util.js";
import DataWatch from "../type/DataWatch.js";
import configDb from "../db/configDb.js";

const config = new DataWatch(await configDb.selectConfig());
config.watch([], util.debounce(data => configDb.updateAllConfig(data) ))
export default config
