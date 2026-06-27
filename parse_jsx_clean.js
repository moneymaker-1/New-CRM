import fs from "fs";

const content = fs.readFileSync("src/App.tsx", "utf8");

const returnStart = content.indexOf("  return (", content.indexOf("export default function App"));
if (returnStart === -1) {
  console.log("Could not find return statement");
  process.exit(1);
}

const jsxContent = content.substring(returnStart);

let line = 1; // local to jsxContent, but we can compute global lines too
let col = 1;
let tagStack = [];

for (let i = 0; i < jsxContent.length; i++) {
  const char = jsxContent[i];
  const nextChar = jsxContent[i + 1];

  if (char === "\n") {
    line++;
    col = 1;
  } else {
    col++;
  }

  // Detect simple HTML tags inside JSX
  // Must start with < followed by a letter (capital or small) or a slash or a fragment tag <> </>
  if (char === "<") {
    // 1. Fragment closing tag </>
    if (nextChar === "/") {
      if (jsxContent[i + 2] === ">") {
        const globalLine = line + 949; // approx offset of return statement
        if (tagStack.length === 0) {
          console.log(`Unmatched fragment closing tag </> at global line ${globalLine}`);
        } else {
          const top = tagStack.pop();
          if (top.name !== "Fragment") {
            console.log(`Mismatch: opened <${top.name}> at global line ${top.line} but closed with </> at global line ${globalLine}`);
          }
        }
        i += 2; // skip />
        continue;
      }
    }
    // 2. Fragment opening tag <>
    if (nextChar === ">") {
      const globalLine = line + 949;
      tagStack.push({ name: "Fragment", line: globalLine });
      i++; // skip >
      continue;
    }

    // 3. Regular opening/closing tag
    if (/^[a-zA-Z\/]/.test(nextChar)) {
      let tagContent = "";
      let j = i + 1;
      let bracketCount = 0;
      let inString = null;
      while (j < jsxContent.length) {
        const c = jsxContent[j];
        if (inString) {
          if (c === inString && jsxContent[j-1] !== "\\") inString = null;
        } else if (c === '"' || c === "'") {
          inString = c;
        } else if (c === "{") {
          bracketCount++;
        } else if (c === "}") {
          bracketCount--;
        } else if (c === ">" && bracketCount === 0) {
          break;
        }
        tagContent += c;
        j++;
      }

      i = j; // skip forward

      tagContent = tagContent.trim();
      const globalLine = line + 949;

      if (tagContent.startsWith("/")) {
        // Closing tag
        const tagName = tagContent.substring(1).trim().split(/\s+/)[0];
        if (tagStack.length === 0) {
          console.log(`Unmatched closing tag </${tagName}> at global line ${globalLine}`);
        } else {
          const top = tagStack.pop();
          if (top.name !== tagName) {
            console.log(`Mismatch: opened <${top.name}> at global line ${top.line} but closed with </${tagName}> at global line ${globalLine}`);
          }
        }
      } else if (tagContent.endsWith("/")) {
        // Self-closing
      } else {
        // Opening tag
        const tagName = tagContent.split(/\s+/)[0];
        if (!["img", "input", "br", "hr", "meta", "link"].includes(tagName.toLowerCase())) {
          tagStack.push({ name: tagName, line: globalLine });
        }
      }
    }
  }
}

console.log("\n--- UNCLOSED TAGS ---");
if (tagStack.length > 0) {
  for (let t of tagStack) {
    console.log(`- <${t.name}> opened at global line ${t.line}`);
  }
} else {
  console.log("No unclosed tags!");
}
