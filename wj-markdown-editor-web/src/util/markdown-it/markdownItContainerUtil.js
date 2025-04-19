function upperCaseFirst(str) {
  if (!str) {
    return ''
  } else if (str.length === 1) {
    return str.toUpperCase()
  }
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase()
}
function helper(md, type, marker) {
  // 忽略大小写
  const reg = new RegExp(`^${type}\\s+(\\S*)$`, 'i')
  const regNotTitle = new RegExp(`^${type}$`, 'i')
  return {
    type,
    marker,
    validate(params) {
      return params.trim().match(reg) || regNotTitle.test(params.trim())
    },
    render(tokens, idx) {
      if (type.toLowerCase() === 'details') {
        if (tokens[idx].nesting === 1) {
          const title = regNotTitle.test(tokens[idx].info.trim()) ? upperCaseFirst(type) : md.utils.escapeHtml(tokens[idx].info.trim().match(reg)[1])
          return `
          <div class="wj-markdown-it-container wj-markdown-it-container-${type.toLowerCase()}">
            <details><summary style="font-weight: 500; user-select: none">${title}</summary>\n
            <div class="wj-markdown-it-container-content">\n`
        } else {
          return '</div></details></div>\n'
        }
      }
      // 始终显示标题
      if (tokens[idx].nesting === 1) {
        const title = regNotTitle.test(tokens[idx].info.trim()) ? upperCaseFirst(type) : md.utils.escapeHtml(tokens[idx].info.trim().match(reg)[1])
        return `
          <div class="wj-markdown-it-container wj-markdown-it-container-${type.toLowerCase()}">
            <div class="wj-markdown-it-container-title">${title}</div>
            <div class="wj-markdown-it-container-content">\n`
      } else {
        return '</div></div>\n'
      }
      // 没有标题
      // if (regNotTitle.test(tokens[idx].info.trim())) {
      //   if (tokens[idx].nesting === 1) {
      //     // opening tag
      //     return `
      //     <div class="wj-markdown-it-container wj-markdown-it-container-${type.toLowerCase()}">
      //       <div class="wj-markdown-it-container-content">\n`
      //   } else {
      //     // closing tag
      //     return '</div>\n'
      //   }
      // } else {
      //   // 有标题
      //   const m = tokens[idx].info.trim().match(reg)
      //   if (tokens[idx].nesting === 1) {
      //     // opening tag
      //     return `
      //     <div class="wj-markdown-it-container wj-markdown-it-container-${type.toLowerCase()}">
      //       <div class="wj-markdown-it-container-title">${md.utils.escapeHtml(m[1])}</div>
      //       <div class="wj-markdown-it-container-content">\n`
      //   } else {
      //     // closing tag
      //     return '</div></div>\n'
      //   }
      // }
    },
  }
}

export default {
  createContainerPlugin: (md, typeList) => {
    const list = []
    for (const type of typeList) {
      list.push(helper(md, type, ':'))
      list.push(helper(md, type, '!'))
    }
    return list
  },
}
