;安装时写入
!macro customInstall
   WriteRegStr HKCR ".md" "" "Markdown File"
   WriteRegStr HKCR ".md\ShellNew" "NullFile" ""
   WriteRegStr HKCR "Markdown File" "" "Markdown"
   WriteRegStr HKCR "Markdown File\shell\open" "Icon" "$INSTDIR\wj-markdown-editor.exe"
!macroend
;卸载时清除
!macro customUninstall
   DeleteRegKey HKCR ".md\ShellNew"
!macroend
