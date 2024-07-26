import util from "../util/util.js";
import DataWatch from "../type/DataWatch.js";
import dbUtil from "../util/dbUtil.js";

const config = new DataWatch(await dbUtil.selectConfig());
config.watch([], data => util.debounce(() => { dbUtil.updateAllConfig(data) })())
export default config
