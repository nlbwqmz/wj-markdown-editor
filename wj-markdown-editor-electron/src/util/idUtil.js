import {nanoid} from "nanoid";

export default {
    createId: () => {
        return 'a' + nanoid()
    }
}
