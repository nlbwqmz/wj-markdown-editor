import alertCompletion from '@/util/editor/completion/alertCompletion.js'
import codeBlockCompletion from '@/util/editor/completion/codeBlockCompletion.js'
import CommonCompletion from '@/util/editor/completion/CommonCompletion.js'
import containerCompletion from '@/util/editor/completion/containerCompletion.js'
import headingCompletion from '@/util/editor/completion/headingCompletion.js'
import tableCompletion from '@/util/editor/completion/tableCompletion.js'

const handlerList = [CommonCompletion, tableCompletion, codeBlockCompletion, headingCompletion, containerCompletion, alertCompletion]

function autocompletionHandler(context) {
  const word = context.matchBefore(/\w*/)
  const suggestions = []
  handlerList.forEach((handler) => {
    const itemSuggestions = handler(context)
    if (itemSuggestions && Array.isArray(itemSuggestions) && itemSuggestions.length > 0) {
      suggestions.push(...itemSuggestions)
    }
  })
  return {
    from: word.from,
    to: word.to,
    options: suggestions,
    validFor: undefined,
    filter: false,
  }
}

export default autocompletionHandler
