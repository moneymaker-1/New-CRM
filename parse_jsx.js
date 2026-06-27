import fs from "fs";

const content = fs.readFileSync("src/App.tsx", "utf8");

let line = 1;
let col = 1;
let inString = null;
let inComment = null;
let tagStack = [];

for (let i = 0; i < content.length; i++) {
  const char = content[i];
  const nextChar = content[i + 1];
  const prevChar = content[i - 1];

  if (char === "\n") {
    line++;
    col = 1;
  } else {
    col++;
  }

  // Comments
  if (inComment === 'single') {
    if (char === "\n") inComment = null;
    continue;
  }
  if (inComment === 'multi') {
    if (char === "*" && nextChar === "/") {
      inComment = null;
      i++;
    }
    continue;
  }
  if (!inString) {
    if (char === "/" && nextChar === "/") {
      inComment = 'single';
      i++;
      continue;
    }
    if (char === "/" && nextChar === "*") {
      inComment = 'multi';
      i++;
      continue;
    }
  }

  // Strings
  if (inString) {
    if (char === inString && prevChar !== "\\") {
      inString = null;
    }
    continue;
  }
  if (char === '"' || char === "'" || char === "`") {
    inString = char;
    continue;
  }

  // We are looking for JSX tags: <Name ...> or </Name> or <Name ... />
  // Simple heuristic: look for '<' followed by a letter or '/'
  if (char === "<" && /^[a-zA-Z\/]/.test(nextChar)) {
    // Read the whole tag until '>'
    let tagContent = "";
    let j = i + 1;
    let bracketCount = 0; // handle {...} inside tag attributes
    let inTagString = null;

    while (j < content.length) {
      const c = content[j];
      if (inTagString) {
        if (c === inTagString && content[j-1] !== "\\") {
          inTagString = null;
        }
      } else if (c === '"' || c === "'") {
        inTagString = c;
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

    // Move outer index i to j (which is on '>')
    i = j;

    tagContent = tagContent.trim();
    if (tagContent.startsWith("/")) {
      // Closing tag
      const tagName = tagContent.substring(1).trim().split(/\s+/)[0];
      if (tagStack.length === 0) {
        console.log(`Unmatched closing tag </${tagName}> at line ${line}, col ${col}`);
      } else {
        const top = tagStack.pop();
        if (top.name !== tagName) {
          console.log(`Mismatch: opened <${top.name}> at line ${top.line}, col ${top.col} but closed with </${tagName}> at line ${line}, col ${col}`);
        }
      }
    } else if (tagContent.endsWith("/")) {
      // Self-closing tag, e.g. <input />
      // Do nothing
    } else {
      // Opening tag
      const tagName = tagContent.split(/\s+/)[0];
      // Check if it's a self-closing tag in the sense of <br> or <hr> or <img ...> (not typical in strict JSX but check just in case)
      if (["img", "input", "br", "hr", "link", "meta"].includes(tagName.toLowerCase())) {
        // usually self-closing
      } else {
        tagStack.push({ name: tagName, line, col });
      }
    }
  }
}

if (tagStack.length > 0) {
  console.log(`Unclosed JSX tags remaining:`);
  for (let t of tagStack.slice(-10)) {
    console.log(`- <${t.name}> opened at line ${t.line}, col ${t.col}`);
  }
} else {
  console.log("JSX tags are perfectly balanced!");
}
