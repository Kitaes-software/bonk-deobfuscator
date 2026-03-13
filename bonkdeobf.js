process.on("uncaughtException", (e) => {
	console.log("\n")
	console.error(e)
	process.exit(1)
})
const js_beautify = require('js-beautify/js').js
const fs = require("fs")
const minify = require("uglify-js").minify
const esprima = require("esprima")
const escodegen = require("escodegen")
const estraverse = require("estraverse")
const ini = require("ini")
const util = require("util")
let consoleText
function fromAst(ast){
	return escodegen.generate(ast, {format: {indent: {style: "\t"}}})
}
function log(text) {
	process.stdout.write(`\n${text}`)
	consoleText = text
}
function changeStatus(status){
	process.stdout.write(`\r${consoleText}: ${status}`)
}
const codeStringList = []
function noStrings(code){
	const tokens = esprima.tokenize(code)
	code = ""
	for (const a of tokens){
		if (a.type === "Keyword") code += " "
		if (a.type === "String") {
			code += "''"
			codeStringList.push(a.value)
			continue
		}
		code += a.value
		if (a.type === "Keyword" || a.value === "static") code += " "
	}
	return js_beautify(code, {e4x: true, indent_with_tabs: true})
}
function replaceDecsWithExpr(decCode){
	const ast = esprima.parseScript(decCode)
	const expr = []
	const decs = []
	for (let i = 0; i < ast.body[0].declarations.length; i++) {
		const declaration = ast.body[0].declarations[i]
		decs.push(declaration.id.name)
		if (declaration.init) expr.push(declaration.init)
	}
	ast.body = expr
	return {code: fromAst(ast), decs: decs}
}
function replaceVars(code, oldNames, newNames){
	const tokens = esprima.tokenize(code)
	code = ""
	let isPrevTokenDot = false
	for (const a of tokens){
		if (a.type === "Keyword")  code += " "
		if (a.type === "Identifier"){
			const oldNameIndex = oldNames.indexOf(a.value)
			if (!isPrevTokenDot && oldNameIndex !== -1){
				code += newNames[oldNameIndex]
				continue
			}
		}
		code += a.value
		if (a.type === "Keyword" || a.value === "static") code += " "
		isPrevTokenDot = a.type === "Punctuator" && a.value === "."
	}
	return js_beautify(code, {e4x: true, indent_with_tabs: true})
}
function replaceVarsAst(ast, oldNames, newNames){
	estraverse.traverse(ast, {enter(node, parent){
		if (node.type !== "Identifier") return
		if (parent.type === "MemberExpression" && node.property === node) return
		const index = oldNames.indexOf(node.name)
		if (index !== -1) node.name = newNames[index]
	}})
}
function replaceVarsObj(code, replacements){
	const tokens = esprima.tokenize(code)
	code = ""
	let isPrevTokenDot = false
	for (const a of tokens){
		if (a.type === "Keyword")  code += " "
		if (a.type === "Identifier"){
			if (!isPrevTokenDot && typeof replacements[a.value] === "string"){
				code += replacements[a.value]
				continue
			}
		}
		code += a.value
		if (a.type === "Keyword" || a.value === "static") code += " "
		isPrevTokenDot = a.type === "Punctuator" && a.value === "."
	}
	return js_beautify(code, {e4x: true, indent_with_tabs: true})
}
function replaceVarsAstObj(ast, replacements){
	estraverse.traverse(ast, {enter(node, parent){
		if (node.type !== "Identifier") return
		if (parent.type === "MemberExpression" && node.property === node) return
		if (typeof replacements[node.name] === "string") node.name = replacements[node.name]
	}})
}
function returnStrings(code){
	for (let i = 0; i < codeStringList.length; i++){
		code = code.replace("''", codeStringList[i])
	}
	return code
}
function writeToFile(filename, contents){
	const dirname = filename.split("/")[0]
	if (!fs.existsSync(dirname)) fs.mkdirSync(dirname)
	fs.writeFileSync(filename, contents)
}
function test(code){
	writeToFile("test/alpha2s.js", code)
	process.exit(0)
}
let strCount = 0
function generateRandomString(letter){
	let str = letter + (strCount.toString(36)).padStart(3, "0")
	strCount++
	return str
}
const eo = {
	type: "VariableDeclarator",
	id: {
		type: "Identifier",
		name: "ZZZ"
	}
}
let r = false
let version
function setVarNames(thisOnly, code){
	if (thisOnly) {
		process.stdout.write("-- [Bonk Deobfuscator] --")
		code = fs.readFileSync("deobfuscated/alpha2s.js", {encoding: "utf8"})
		version = [...code.matchAll(/news:/g)].length
	}
	log("Setting variable names")
	const data = ini.decode(fs.readFileSync("variableNames.ini", {encoding: "ascii"}))
	if (data.version != version){
		log(`Error: version mismatch. Variable names version: ${data.version}, Bonk version: ${version}`)
		if (thisOnly) process.exit(0)
		else return code
	}
	const replacements = {}
	for (const fName of Object.keys(data.f)){
		const funcr = data.f[fName]
		replacements[fName] = funcr.name
		delete funcr.name
		if (funcr.args){
			const args = funcr.args.split(",")
			for (let i = 0; i < args.length; i++){
				replacements[fName + "a" + i] = args[i]
			}
		}
		delete funcr.args
		for (const n of Object.keys(funcr)){
			replacements[fName + "v" + n] = funcr[n]
		}
	}
	code = replaceVarsObj(code, replacements)
	const ast = esprima.parseScript(code)
	const vl = []
	estraverse.traverse(ast, {enter(node, parent){
		if (node.type === "Identifier"){
			vl.push(node.name)
			return
		}
		if (node.type === "ExpressionStatement" && node.expression.type === "AssignmentExpression"){
			const ex = node.expression
			if (ex.left.name === "deleteThis"){
				Object.assign(node, {
	                type: "VariableDeclaration",
	                declarations: [eo],
					kind: "let"
				})
			}
			else if (ex.left.name === "unused"){
				node.expression = ex.right
				this.skip()
			}
			return
		}
		if (node.type !== "VariableDeclaration") return
		for (let i = 0; i < node.declarations.length; i++) {
			const dec = node.declarations[i]
			if (dec.id.name === "deleteThis" || (dec.id.name === "unused" && !dec.init)){
				node.declarations.splice(i, 1)
				i--
			}
			else if (dec.id.name === "unused" && dec.init){
				if (dec.init.type.endsWith("Expression")){
					node.type = "ExpressionStatement"
					node.expression = dec.init
				}
				else{
					Object.assign(node, dec.init)
				}
				this.skip()
			}
		}
		if (node.declarations.length === 0) node.declarations[0] = eo
	}})
	if (process.argv.includes("showvarusage")){
		log("Most used variables")
		let counts = {}
		for (const v of vl) {
			counts[v] = counts[v] ? counts[v] + 1 : 1;
		}
		counts = Object.fromEntries(
			Object.entries(counts).sort(([, a], [, b]) => b - a)
		);
		const l = Object.keys(counts)
		for (let i = 0; i < l.length; i++){
			if (!/^f\d/.test(l[i])){
				l.splice(i, 1)
				i--
			}
		}
		for (let i = 0; i < 100; i++){
			log(l[i] + ": " + counts[l[i]])
		}
	}
	code = fromAst(ast).replaceAll("let ZZZ;", "").replaceAll("const ZZZ;", "")
	r = true
	return code
}
function finalCleanup(code){
	log("Final cleanup")
	if (r){
		code = (minify(code, {compress: false, mangle: false})).code
	}
	code = js_beautify(code, {e4x: true, indent_with_tabs: true})
	const tmp = code.split("\n")
	for (const i in tmp){
		if (tmp[i].startsWith("\t")) tmp[i] = tmp[i].slice(1)
		if (tmp[i].trim()) tmp[i] += "\n"
	}
	code = tmp.join("")
	return code
}
if (process.argv.includes("namesonly")){
	let code = finalCleanup(setVarNames(true))
	const filename = "deobfuscated/alpha2s.js"
	log("Saving deobfuscated code to " + filename)
	writeToFile(filename, code)
	process.exit(0)
}
const path = "alpha2s.js"
process.stdout.write("-- [Bonk Deobfuscator] --")
log("Reading " + path)
if (!fs.existsSync(path)){
	log(path + " Does not exist. Please provide it in the same directory the deobfuscator is located in")
	process.exit(1)
}
const response = fs.readFileSync(path, {encoding: "utf8"})
version = [...response.matchAll(/news:/g)].length
log("Bonk version: " + version)
log("Deobfuscation started")
const t = Date.now()
function noDuplicate(array) {
	return [...new Set(array)]
}
function escapeRegExp(string) {
	return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}
log("Unminifing the code")
let tmp = js_beautify(response, { e4x: true, unescape_strings: true, indent_with_tabs: true })
const splitedText = tmp.split("requirejs")
let returncode = `requirejs${splitedText[1]}`
log("Checking for cache")
if (!fs.existsSync("cache/1.js")){
log("Setting up main variables")
const MAINFUNCTION = splitedText[0].match(/[^\[]+/)[0]
const MAINARRAY = splitedText[0].match(/^var ([^=^\s]+);/m)[1]
log(`eval ${MAINFUNCTION} function`)
eval(`var ${MAINFUNCTION};${response.split("requirejs")[0]}`)
log(`Replacing "var a = ${MAINFUNCTION}; a.bcd(123)" to "${MAINFUNCTION}.bcd(123)"`)
tmp = returncode.match(new RegExp(`var (\\S+) = ${escapeRegExp(MAINFUNCTION)};`, ""))[1]
returncode = returncode.replaceAll(`${tmp}.`, `${MAINFUNCTION}.`)
log(`Replacing all duplicate functions`)
tmp = [...splitedText[0].matchAll(new RegExp(`(?<v>${escapeRegExp(MAINFUNCTION)}\\.[\\S]+) = (?<f>function\\(\\) \\{.+?};)`, "gs"))]
changeStatus(tmp.length)
let VARIABLES = tmp.map((m) => m.groups.v)
let FUNCTIONS = tmp.map((m) => m.groups.f)
let indices = {}
for (let i = 0; i < FUNCTIONS.length; i++) {
	if (!indices[FUNCTIONS[i]]) {
		indices[FUNCTIONS[i]] = []
	}
	indices[FUNCTIONS[i]].push(i)
}
for (const key in indices) {
	const element = indices[key]
	for (let i = 0; i < element.length; i++) {
		splitedText[0] = splitedText[0].replaceAll(VARIABLES[element[i]], VARIABLES[element[0]])
		returncode = returncode.replaceAll(VARIABLES[element[i]], VARIABLES[element[0]])
	}
}
log(`Replacing math operation`)
const OPERATIONEQUALVARIABLE = /case 0:\n\s+(\S+) = .+\n.+break;/gm.exec(splitedText[0])[1]
tmp = new RegExp(
	`return {\\s+(\\S+): function\\(\\) {\\s+var ${escapeRegExp(OPERATIONEQUALVARIABLE)}, (.+) = arguments;\\s+switch \\((.+)\\)`,
	"gm"
).exec(splitedText[0])
const OPERATIONFUNCTION = new RegExp(`(${escapeRegExp(MAINFUNCTION)}\\....) = function\\(\\) {\\s+return.+${tmp[1]}`, "gm").exec(splitedText[0])[1]
const OPERATIONFUNCTIONSETTER = new RegExp(
	`(${escapeRegExp(MAINFUNCTION)}\\....) = function\\(\\) {\\s+return.+${escapeRegExp(
		new RegExp(`,\\s+(\\S+): function.+\\s+${escapeRegExp(tmp[3])} =`, "gm").exec(splitedText[0])[1]
	)}`,
	"gm"
).exec(splitedText[0])[1]
const OPERATIONARGUMENTVARIABLE = escapeRegExp(tmp[2])
tmp = returncode.match(
	new RegExp(
		`${escapeRegExp(OPERATIONFUNCTION)}\\((?:[^)(]|\\((?:[^)(]|\\((?:[^)(]|\\([^)(]*\\))*\\))*\\))*\\)|${escapeRegExp(
			OPERATIONFUNCTIONSETTER
		)}\\(\\d+\\)`,
		"g"
	)
)
// FUNCTION\((?:[^)(]|\((?:[^)(]|\((?:[^)(]|\([^)(]*\))*\))*\))*\)
var OPERATIONFUNCTIONSETTERVALUE = 0
for (let i = 0; i < tmp.length; i++) {
	changeStatus((i+1) + "/" + tmp.length)
	const element = tmp[i]
	if (element.includes(OPERATIONFUNCTION)) {
		const args = element.replace(`${OPERATIONFUNCTION}(`, "").replace(/.$/, "").replace(/\s/g, "").split(",")
		if (args[args.length - 1].includes(OPERATIONFUNCTIONSETTER)) {
			OPERATIONFUNCTIONSETTERVALUE = parseInt(new RegExp(`${escapeRegExp(OPERATIONFUNCTIONSETTER)}\\((\\d+)\\)`).exec(args[args.length - 1])[1])
			args.pop()
		}
		var value = new RegExp(`case ${OPERATIONFUNCTIONSETTERVALUE}:\\n\\s+${escapeRegExp(OPERATIONEQUALVARIABLE)} = (.+);\\n.+break;`, "gm").exec(
			splitedText[0]
		)[1]
		for (let j = 0; j < args.length; j++) {
			value = value.replaceAll(`${OPERATIONARGUMENTVARIABLE}[${j}]`, args[j])
		}
		try {
			value = eval(value)
		} catch (error) {
		} finally {
			returncode = returncode.replace(element, value)
		}
	} else {
		OPERATIONFUNCTIONSETTERVALUE = parseInt(new RegExp(`${escapeRegExp(OPERATIONFUNCTIONSETTER)}\\((\\d+)\\)`).exec(element)[1])
	}
}
log(`Replacing "var a = ${MAINARRAY}; a[123]" to "${MAINARRAY}[123]"`)
tmp = [...returncode.matchAll(new RegExp(`\\s+(?<v>\\S+) = ${escapeRegExp(MAINARRAY)}.*$`, "gm"))].map((m) => m.groups.v)
for (let i = 0; i < tmp.length; i++) {
	changeStatus((i+1) + "/" + tmp.length)
	returncode = returncode.replaceAll(tmp[i], MAINARRAY)
}
const ARRAYFUNCTION = new RegExp(`${escapeRegExp(MAINARRAY)} = .+?(${escapeRegExp(MAINFUNCTION)}\\....)`, "").exec(splitedText[0])[1]
log(`Replacing "${ARRAYFUNCTION}(123)" to "real data"`)
const br = (s) => s ? s.replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/"/g, '\\"') : ""
returncode = returncode.replaceAll(new RegExp(`${escapeRegExp(ARRAYFUNCTION)}\\(\\d+\\)`, "g"), v => `"${br(eval(v))}"`)
tmp = noDuplicate(returncode.match(new RegExp(`${escapeRegExp(ARRAYFUNCTION)}\\((?:[^)(]|\\((?:[^)(]|\\((?:[^)(]|\\([^)(]*\\))*\\))*\\))*\\)`, "g")))
for (let i = 0; i < tmp.length; i++) {
	changeStatus((i+1) + "/" + tmp.length)
	const element = tmp[i]
	try {
		returncode = returncode.replaceAll(element, `"${eval(element).replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/"/g, '\\"')}"`)
	} catch (error) {
		const args = element.replace(`${ARRAYFUNCTION}(`, "").replace(/.$/, "")
		const value = parseInt(new RegExp(`${escapeRegExp(args)} = (\\d+)`).exec(returncode)[1])
		returncode = returncode.replaceAll(
			element,
			`"${eval(`${ARRAYFUNCTION}(${value})`).replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/"/g, '\\"')}"`
		)
	}
}
log(`Replacing "${MAINARRAY}[123]" to "real data"`)
returncode = returncode.replaceAll(new RegExp(`${escapeRegExp(MAINARRAY)}\\[\\d+\\]`, "g"), v => `"${br(eval(v))}"`)
tmp = noDuplicate(
	returncode.match(new RegExp(`${escapeRegExp(MAINARRAY)}\\[(?:[^\\]\\[]|\\[(?:[^\\]\\[]|\\[(?:[^\\]\\[]|\\[[^\\]\\[]*\\])*\\])*\\])*\\]`, "g"))
)
// ARRAY\[(?:[^\]\[]|\[(?:[^\]\[]|\[(?:[^\]\[]|\[[^\]\[]*\])*\])*\])*\]
for (let i = 0; i < tmp.length; i++) {
	changeStatus((i+1) + "/" + tmp.length)
	const element = tmp[i]
	try {
		returncode = returncode.replaceAll(element, `"${eval(element).replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/"/g, '\\"')}"`)
	} catch (e) {
		var args = element.replace(`${MAINARRAY}[`, "").replace(/.$/, "")
		try{
			var value = parseInt(new RegExp(`${escapeRegExp(args)} = (\\d+)`).exec(returncode)[1])
		}
		catch(e) {
			returncode = returncode.replaceAll(element, '"undefined"')
		}
		returncode = returncode.replaceAll(new RegExp("([^0-9a-zA-Z_])" + escapeRegExp(element), "g"), `$1"${eval(`${MAINARRAY}[${value}]`).replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/"/g, '\\"')}"`)
	}
}
tmp = []
log(`Removing ${MAINARRAY}`);
returncode = returncode.replaceAll(new RegExp(`\\n\\s*${escapeRegExp(MAINARRAY)} = ${escapeRegExp(MAINARRAY)};`, 'g'), "")
returncode = returncode.replaceAll(new RegExp(`\\n\\s*var ${escapeRegExp(MAINARRAY)};`, 'g'), "")
returncode = returncode.replaceAll(MAINARRAY + ", ", "")
returncode = returncode.replaceAll(", " + MAINARRAY, "")
returncode = returncode.replaceAll(new RegExp(`${escapeRegExp(MAINARRAY)} = \\[.+?\\];\\n`, 'g'), "")
log(`Removing ${MAINFUNCTION}.abc(); and var abc = ${MAINFUNCTION};`);
returncode = returncode.replaceAll(new RegExp(`\\n\\s+${escapeRegExp(MAINFUNCTION)}\.[a-zA-Z0-9_\$]{3}\(.*?\);`, 'g'), "")
returncode = returncode.replaceAll(new RegExp(`\\n\\s+var [a-zA-Z0-9_\$]{3} = ${escapeRegExp(MAINFUNCTION)};`, 'g'), "")
log("Removing empty if statements")
returncode = returncode.replaceAll(/if \(.+?\) \{\s*\}(?! else)/gm, "")
log("Replacing all array indexing with dot indexing")
returncode = returncode.replaceAll(/\["([a-zA-Z_$][a-zA-Z0-9_\$]*?)"\]/g, ".$1")
log("Cleanup")
returncode = js_beautify(returncode, {e4x: true, indent_with_tabs: true})
log("Removing nonsensical if-statements")
while(true){
	const l = [...returncode.matchAll(/((\t+)[a-zA-Z0-9_\$]{3}\[\d+\] = -?\d+;\n){6}\2if \(.+\) \{([\s\S]+?)\n\2\}/gm)]
	if (l.length === 0) break
	returncode = returncode.replaceAll(/((\t+)[a-zA-Z0-9_\$]{3}\[\d+\] = -?\d+;\n){6}\2if \(.+\) \{([\s\S]+?)\n\2\}/gm, "$3")
}
log("Removing nonsensical for-loops followed by nonsensical if-statements")
for (const vars of returncode.matchAll(new RegExp(`^(\\t+)[a-zA-Z0-9_\\$\\[\\]]+ = (-?\\d+);\\n\\1[a-zA-Z0-9_\\$\\[\\]]+ = (-?\\d+);\\n\\1[a-zA-Z0-9_\\$\\[\\]]+ = (-?\\d+);\\n\\1for \\((var )?[a-zA-Z0-9_\\$\\[\\]]+ = (\\d+);.*(${MAINFUNCTION}\\.[a-zA-Z0-9_\\$]+).+?(\\d+)\\).+\\) \\{\\n((\\1\\t.*?\\n)+)(\\1\\t[a-zA-Z0-9_\\$\\[\\]]+ \\+= 2;\\n)?\\1\\}\\n\\1if \\(.*\\7.+?(\\d+)\\).+\\) \\{([\\s\\S]+?)\\n\\1\\}`, "gm"))){
	let x = +vars[2]
	let y = +vars[3]
	let z = +vars[4]
	let w = +vars[6]
	let func = eval(vars[7])
	let mn1 = +vars[8]
	let mn2 = +vars[12]
	let a = false
	for (let i = w; func(i.toString(), i.toString().length, mn1) !== x; i++){
		z += 2;
		a = true
	}
	const b = func(z.toString(), z.toString().length, mn2) !== y
	let str = ""
	if (vars[10] === vars[9]) vars[10] = "#"
	if (a) str += vars[9].replace(vars[10], "")
	if (b) str += vars[13]
	returncode = returncode.replace(vars[0], str)
}
log("Removing useless for-loops")
returncode = returncode.replaceAll(new RegExp(`^((\\t+)[a-zA-Z0-9_\\$\\[\\]]+ = -?\\d+;\\n){2}\\2for \\(.*${MAINFUNCTION}.*\\n.*\\n\\2\\}`, "gm"), "")
writeToFile("cache/1.js", returncode)
}
else{
	returncode = fs.readFileSync("cache/1.js", {encoding: "utf8"})
}
{
	log("Removing dead code")
	const entries = [...returncode.matchAll(/^(\t*)function [a-zA-Z0-9_\$]+\([a-zA-Z0-9_\$, ]*\) \{\n/gm)]
	let deadCode = []
	for (const a of entries){
		const length = a[1].length + 1
		const split = ((returncode.match(new RegExp(`${escapeRegExp(a[0])}([\\S\\s]+?)\\n${a[1]}\\}`)))[1]).split("\n")
		for (let i = 0; i < split.length; i++){
			const line = split[i]
			const trimmedLine = line.slice(length)
			if (trimmedLine.startsWith("return;") && i < split.length - 1){
				deadCode.push(split.slice(i).join("\n"))
			}
		}
	}
	for (const a of deadCode){
		returncode = returncode.replace(a, "")
	}
	changeStatus(deadCode.length + " sections found")
}
{
	log("Removing unused functions")
	const funcDecs = /function ([a-zA-Z0-9_\$]+)\(.*\) \{/gm
	const funcList = []
	for (const a of returncode.matchAll(funcDecs)){
		funcList.push(a[1])
	}
	log("Total functions: " + funcList.length)
	let filteredCode = returncode.replaceAll(funcDecs, "")
	filteredCode = noStrings(filteredCode)
	const unusedVars = []
	for (const a of funcList){
		if (!filteredCode.includes(a)) unusedVars.push(a)
	}
	log("Unused functions: " + unusedVars.length)
	for (const a of unusedVars){
		const regex = new RegExp(`^(\\t*)function ${escapeRegExp(a)}\\(.*\\) \\{[\\s\\S]+?\\n\\1\\}`, "m")
		returncode = returncode.replace(regex, "")
	}
}
try{
	log('Deobfuscating packets')
	const varName = (returncode.match(/[a-zA-Z0-9_\$\[\]]+ = \(1, [a-zA-Z0-9_\$\[\]]+\)\([a-zA-Z0-9_\$\[\]]+, \{\s+reconnection/)[0]).split(" = ")[0]
	for (const a of returncode.matchAll(new RegExp(escapeRegExp(varName) + "\\.(on|emit)\\(([a-zA-Z0-9_\\$\\[\\]]+)", "g"))){
		const match = returncode.match(new RegExp(`${escapeRegExp(a[2])} = .+;`))
		if (!match) continue
		const varValue = match[0].split(" = ")[1].replace(";", "")
		returncode = returncode.replace(`${a[2]} = ${varValue};`, "")
		returncode = returncode.replace(a[2], varValue)
	}
}catch(e){changeStatus("Not found")}
log("Cleanup")
returncode = js_beautify(returncode, {e4x: true, indent_with_tabs: true})
{
	log("Unpacking arrays")
	function makeSafe(code){
		const tokens = esprima.tokenize(code)
		code = ""
		let isPrevTokenDot = false
		for (const a of tokens){
			if (a.type === "Keyword") code += " "
			if (a.type === "Identifier" && !isPrevTokenDot){
				if (a.value.startsWith("f") && !isNaN(parseInt(a.value[1]))) {
					code += "_" + a.value
					continue
				}
			}
			code += a.value
			if (a.type === "Keyword" || a.value === "static") code += " "
			isPrevTokenDot = a.type === "Punctuator" && a.value === "."
		}
		return code
	}
	returncode = makeSafe(returncode)
	const ast = esprima.parseScript(returncode)
{
	let newScopeCounter = 0
	let unobfuscatedIndex = 0
	let hasFuncName = false
	let shouldCount = false
	let esc = 0
	let af = 0
	const oldNames = []
	const newNames = []
	function add(node, a){
		if (!(node.id && node.id.name)) return
		hasFuncName = true
		oldNames.push(node.id.name)
		node.id.name = a ? ("ef" + esc) : ("f" + newScopeCounter)
		newNames.push(node.id.name)
		return true
	}
	const vl = []
	const xd = []
	let cn
	function renameArgs(node){
		for (let i = 0; i < node.params.length; i++){
			let param = node.params[i]
			if (param.type === "RestElement") param = param.argument
			else if (param.type === "AssignmentPattern") param = param.left
			oldNames.push(param.name)
			param.name = "f" + newScopeCounter + "a" + i
			newNames.push(param.name)
		}
	}
	estraverse.traverse(ast, {enter(node, parent){
		if (node.type === "VariableDeclarator" && !(node.init && node.init.elements && node.init.elements[0].name === "arguments") && !parent.unmarked){
			// looks like the obfuscation failed there for some unknown reason, it mostly happens in render func
			if (xd.includes(node.id.name)) return
			xd.push(node.id.name)
			oldNames.push(node.id.name)
			node.id.name = "f" + newScopeCounter + "v" + unobfuscatedIndex
			newNames.push(node.id.name)
			unobfuscatedIndex++
			if (!shouldCount){
				renameArgs(cn)
			}
			shouldCount = true
			return
		}
	    if (!node.type.endsWith("FunctionExpression") && node.type !== "FunctionDeclaration") return
		cn = node
		if (shouldCount) {
			shouldCount = false
			newScopeCounter++
			unobfuscatedIndex = 0
		}
	    if (!node.body) return
	    let blockNode = node.body
	    if (!blockNode.body[0]) {
			if (add(node, true)) esc++
			return
		}
	    let scopeDecIndex = 0
	    let scopeDec = blockNode.body[0]
	    if (scopeDec.type === "ExpressionStatement") {
	        scopeDec = blockNode.body[1]
	        scopeDecIndex = 1
	    }
	    if (!(scopeDec && scopeDec.declarations && scopeDec.declarations.length === 1)) {
			if (add(node)) newScopeCounter++
			return
		}
		renameArgs(node)
	    const dec = scopeDec.declarations[0]
	    if (!(dec.init && dec.init.type === "ArrayExpression" && dec.init.elements.length === 1 && dec.init.elements[0].name === "arguments")) return
	    add(node)
		shouldCount = true
	    const oldScopeName = dec.id.name
	    const indexTable = [] 
	    estraverse.traverse(blockNode, {enter(node, parent){
	        if (node.type !== "MemberExpression") return
	        if (!node.computed) return
	        if (!node.object.type === "Identifier") return
	        if (node.object.name !== oldScopeName) return
	        const index = node.property.value
	        if (index === 0 && parent.type === "MemberExpression") {
	            const val = parent.property.value
	            for (const a of Object.keys(parent)){
	                delete parent[a]
	            }
	            parent.type = "Identifier"
	            parent.name = `f${newScopeCounter}a${val}`
	            return
	        }
	        if (!indexTable.includes(index)) indexTable.push(index)
	        for (const a of Object.keys(node)){
	            delete node[a]
	        }
	        node.type = "Identifier"
			const newName = `f${newScopeCounter}v${indexTable.indexOf(index)}`
	        node.name = newName
	    }})
		scopeDec.unmarked = true
	    if (indexTable.length === 0) blockNode.body.splice(scopeDecIndex, 1)
	    for (let i = 0; i < indexTable.length; i++){
	        scopeDec.declarations[i] = {
	            type: "VariableDeclarator",
	            id: {
	                type: "Identifier",
	                name: "f" + newScopeCounter + "v" + i
	            }
	        }
	    }
		shouldCount = false
		newScopeCounter++
		unobfuscatedIndex = 0
	}})
	replaceVarsAst(ast, oldNames, newNames)
	estraverse.traverse(ast, {enter(node, parent){
		if (!(node.type === "VariableDeclaration" && !parent.type.startsWith("For"))) return
		for (let i = 0; i < node.declarations.length; i++) {
			const n = node.declarations[i].id.name
			if (vl.includes(n)) {
				node.declarations.splice(i, 1)
				i--
				continue
			}
		}
		if (node.declarations.length === 0) node.declarations[0] = eo
	}})
}
	log('Replacing "abc" with "element" in "let abc = document.getElementById("element")"') // 80 characters damn, i barely managed to make it fit
{
	const r = {}
	estraverse.traverse(ast, {enter(node){
		if (!(node.type === "AssignmentExpression" && node.left.type === "Identifier")) return
		if (!(node.right.type === "CallExpression" && node.right.callee.type === "MemberExpression")) return
		if (!(node.right.callee.object.name === "document" && node.right.callee.property.name === "getElementById")) return
		r[node.left.name] = (node.right.arguments[0].value).replaceAll("-", "minus")
	}})
	replaceVarsAstObj(ast, r)
}
	log("Removing unused functions")
{
	let unc = 1
	while (unc > 0) {
		unc = 0
		const funcs = {}
		const emptyFuncs = []
		estraverse.traverse(ast, {enter(node, parent){
			if (node.type === "FunctionDeclaration" && node.id.name){
				funcs[node.id.name] = {node: node, parent: parent, used: false}
				if (node.body.length === 0) {
					emptyFuncs.push(node.id.name)
				}
			}
		}})
		estraverse.traverse(ast, {enter(node, parent){
			if (node.type === "Identifier" && parent.type !== "FunctionDeclaration"){
				if (funcs[node.name]) funcs[node.name].used = true
			}
			if (node.expression && node.expression.type === "CallExpression" && node.expression.callee.type === "Identifier"){
				if (emptyFuncs.includes(node.expression.callee.name)) {
					parent.splice(parent.indexOf(node), 1)
					this.skip()
				}
			}
		}})
		for (const i of Object.keys(funcs)){
			if (!funcs[i].used) {
				unc++
				funcs[i].parent.body.splice(funcs[i].parent.body.indexOf(funcs[i].node), 1)
			}
		}
	}
}
	log("Re-scoping variables")
{
	let forLoopDepth = -1
	const scopes = []
	const funcs = []
	const vars = {}
	function getNewLength(arr1, arr2){
		let counter = 0
		for (let i = 0; i < Math.min(arr1.length, arr2.length); i++){
			if (arr1[i] !== arr2[i]) return counter
			counter++
		}
		return counter
	}
	let scopeIdCount = 0
	function blockEnter(node, parent){
		if (node.type === "FunctionDeclaration" || node.type.endsWith("FunctionExpression")){
			funcs.push(node)
		}
		if (node.type.startsWith("For")){
			forLoopDepth++
			node.parent = parent
			scopes.push(node)
		}
		else if (node.type === "BlockStatement"){
			node.id = scopeIdCount
			scopeIdCount++
			node.funcs = [...funcs]
			scopes.push(node)
		} 
	}
	function blockLeave(node, parent){
		if (node.type.startsWith("For")){
			forLoopDepth--
			scopes.pop()
		}
		if (node.type === "FunctionDeclaration" || node.type.endsWith("FunctionExpression")){
			funcs.pop()
		}
		else if (node.type === "BlockStatement"){
			scopes.pop()
		}
	}
	function checkForFuncCall(node){
		if (!node) return true
		if (node.type.endsWith("FunctionExpression")) return false
		estraverse.traverse(node, {enter(node){
			if (node.type === "CallExpression" || node.type === "NewExpression") return true
		}})
		return false
	}
	// STAGE 1: get all variables and remove all declarations
	estraverse.traverse(ast, {enter(node, parent){
		blockEnter(node, parent)
		if (node.type !== "VariableDeclaration") return
		if (node.declarations.length === 1){
			const dec = node.declarations[0]
			if (!dec.init){
				if (!vars[dec.id.name]) vars[dec.id.name] = {
					is: [...scopes],
					refCount: 0,
					modCount: -1,
					decs: []
				}
				node.declarations = [eo]
				return
			}
			vars[dec.id.name] = {
				scopes: [...scopes],
				is: [...scopes],
				refCount: 0,
				modCount: 0,
				decs: [dec.init]
			}
			if (parent.type === "ForStatement"){
				Object.assign(node, {
					type: "AssignmentExpression",
					operator: "=",
					left: dec.id,
					right: dec.init,
				})
				vars[dec.id.name].inForLoop = parent
			}
			else if (parent.type.startsWith("For")){
				Object.assign(node, dec.id)
				vars[dec.id.name].inForLoop = parent
			}
			else {
				Object.assign(node, {
					type: "ExpressionStatement",
					expression: {
						type: "AssignmentExpression",
						operator: "=",
						left: dec.id,
						right: dec.init,
					}
				})
			}
			return
		}
		for (let i = 0; i < node.declarations.length; i++) {
			const dec = node.declarations[i]
			if (!vars[dec.id.name]) vars[dec.id.name] = {
				is: [...scopes],
				refCount: 0,
				modCount: -1,
				decs: []
			}
		}
		node.declarations = [eo]
	},
	leave: blockLeave})
	// STAGE 2: determine the scope of each variable
	function chk(){
	estraverse.traverse(ast, {enter(node, parent){
		blockEnter(node, parent)
		if (node.type === "UpdateExpression" && parent.type !== "ExpressionStatement" && parent.type !== "AssignmentExpression"){
			if (!vars[node.argument.name]) return
			vars[node.argument.name].modCount++
			this.skip()
		}
		if (node.type !== "Identifier") return
		if (parent.type === "MemberExpression" && !parent.computed && parent.property === node) return
		if (!vars[node.name]) return
		if (parent.type === "AssignmentExpression" && parent.left === node){
			vars[node.name].modCount++
			vars[node.name].decs.push(parent.right)
		}
		else if (parent.type === "UpdateExpression") {
			vars[node.name].modCount++
			vars[node.name].refCount++
		}
		else{
			vars[node.name].refCount++
		}
		if (!vars[node.name].scopes) {
			vars[node.name].scopes = [...scopes]
		}
		vars[node.name].scopes.length = getNewLength(vars[node.name].scopes, scopes)
	},
	leave: blockLeave})
	}
	function reset(){
		for (const i of Object.keys(vars)) {
			vars[i].refCount = 0
			vars[i].modCount = -1
		}
	}
	chk()
	// STAGE 3: remove unused vars
	log("Removing unused vars")
	const unusedVars = []
	const unsafeUnusedVars = []
	const safeFuncGroups = ["Math", "SafeTrig", "Date", "JSON"]
	const safeFuncs = {document: ["getElementById"], localStorage: ["getItem"]}
	const safeTopLevelFuncs = ["parseInt"]
	const safeProps = ["toString"]
	let x = 1
	let vl = 0
	while (x > 0) {
		x = 0
		for (const i in vars){
			if (i === "f249v7" && version === 96){
				continue
			}
			if (vars[i].modCount === -1){
				unusedVars.push("")
				delete vars[i]
				continue
			}
			if (vars[i].refCount > 0) continue
			x++
			let unsafe = false
			for (const a of vars[i].decs){
				if (a.type === "Identifier" || a.type === "Literal" || a.type.endsWith("FunctionExpression")) break
				estraverse.traverse(a, {enter(node){
					if (node.type === "NewExpression"){
						unsafe = true
						this.break()
						return
					}
					if (node.type === "CallExpression"){
						const c = node.callee
						if (c.type.endsWith("FunctionExpression")) {
							unsafe = true
							return
						}
						if (c.type === "MemberExpression" && safeProps.includes(c.property.name)) return
						if (c.type === "Identifier" && safeTopLevelFuncs.includes(c.name)) return
						if (c.type !== "MemberExpression" || c.object.type === "MemberExpression") {
							unsafe = true
							return
						}
						if (safeFuncGroups.includes(c.object.name)) return
						if (safeFuncs[c.object.name] && safeFuncs[c.object.name].includes(c.property.name)) return
						unsafe = true
					}
				}})
			}
			unsafe ? unsafeUnusedVars.push(i) : unusedVars.push(i)
		}
		const l = Object.keys(vars).length
		if (vl === 0) vl = l
		for (const i of Object.keys(vars)){
			if (unusedVars.includes(i) || unsafeUnusedVars.includes(i)) delete vars[i]
		}
		estraverse.traverse(ast, {enter(node,parent){
			if (node.type === "ExpressionStatement" && node.expression.type === "AssignmentExpression"){
				if (unusedVars.includes(node.expression.left.name)) {
					Object.assign(node, {
						type: "VariableDeclaration",
						declarations: [eo],
						kind: "let"
					})
				}
				if (unsafeUnusedVars.includes(node.expression.left.name)){
					node.expression = node.expression.right
				}
			}
		}})
		reset()
		chk()
	}
	log("Total vars: " + vl)
	log("Unused vars: " + unusedVars.length)
	const vm = []
	estraverse.traverse(ast, {enter(node, parent){
		blockEnter(node, parent)
		if (node.type !== "Identifier") return
		if (parent && parent.type === "AssignmentExpression" && parent.left === node){
			vm.push(node.name)
			return
		}
		if (/f\d+v\d+/.test(node.name)){
			if (!vars[node.name]) return
			if (vm.includes(node.name)) return
			if (scopes.length !== vars[node.name].scopes.length) return
			vars[node.name].scopes = vars[node.name].is
			vm.push(node.name)
			return
		}
	},
	leave: blockLeave})
	// STAGE 4: put all variable declarations where they belong
	const reps = {}
	const initialCharCode = "i".charCodeAt(0)
	estraverse.traverse(ast, {enter(node, parent){
		blockEnter(node, parent)
		if (node.type === "Identifier" && parent.type === "ForInStatement" && parent.left === node){
			const newName = String.fromCharCode(initialCharCode + forLoopDepth)
			reps[node.name] = newName
			parent.left = {
				type: "VariableDeclaration",
				declarations: [{
					type: "VariableDeclarator",
					id: node,
				}],
				kind: "let"
			}
		}
		if (node.type !== "AssignmentExpression") return
		if (node.left.type !== "Identifier") return
		if (!vars[node.left.name]) return
		const varScopes = vars[node.left.name].scopes
		if (!(varScopes.length === scopes.length && varScopes.every((e,i) => e === scopes[i]))) return
		const xd = vars[node.left.name]
		delete vars[node.left.name]
		const obj = {
			type: "VariableDeclaration",
      		declarations: [{
      		    type: "VariableDeclarator",
      		    id: node.left,
      		    init: node.right
      		}],
      		kind: xd.modCount === 0 ? "const" : "let"
		}
		if (parent.type.startsWith("For")){
			if (parent.init !== node) {
				// if it reached this point, it means that chaz did some lunacy that i have to fix
				vars[node.left.name] = xd // nevermind put it back
				xd.scopes.pop()
				return
			}
			const newName = String.fromCharCode(initialCharCode + forLoopDepth)
			reps[node.left.name] = newName
			parent.init = {
				type: "VariableDeclaration",
				declarations: [{
					type: "VariableDeclarator",
					id: node.left,
					init: node.right
				}],
				kind: "let"
			}
			return
		}
		Object.assign(parent, obj)
	},
	leave: blockLeave})
	replaceVarsAstObj(ast, reps)
	// STAGE 5: put remaining variables at the start of a block
	const remainingVarList = Object.keys(vars)
	const vd = []
	for (let i = 0; i < remainingVarList.length; i++){
		const varName = remainingVarList[i]
		const varInfo = vars[varName]
		if (!varInfo.scopes){
			continue
		}
		let scope = varInfo.scopes[varInfo.scopes.length-1]
		if (scope.type.startsWith("For")){
			scope = scope.body
		}
		if (!vd[scope.id]) vd[scope.id] = {scope: scope, vars: []}
		vd[scope.id].vars.push(varName)
	}
	for (let i = 0; i < vd.length; i++){
		if (!vd[i]) continue
		const decs = []
		for (const a of vd[i].vars){
			decs.push({
				type: "VariableDeclarator",
      			id: {
      			  type: "Identifier",
      			  name: a
      			},
      			init: null
			})
		}
		const obj = {
			type: "VariableDeclaration",
			kind: "let",
			declarations: decs
		}
		if (!vd[i].scope.shift) {
			vd[i].scope = vd[i].scope.body
		}
		vd[i].scope.unshift(obj)
	}
}
	log("Removing unused arguments")
{
	const initialCharCode = "e".charCodeAt(0)
	let afd = -1
	const argList = []
	const usedArgs = []
	const unusedArgs = []
	const funcs = []
	estraverse.traverse(ast, {enter(node, parent){
		if (node.type === "FunctionDeclaration" || node.type.endsWith("FunctionExpression")){
			if (node.type === "ArrowFunctionExpression") afd++
			if (node.params.length === 0) return
			funcs.push(node)
			for (const a of node.params){
				argList.push(a.name)
			}
		}
		else if (node.type === "Identifier"){
			if (parent.type === "FunctionDeclaration" || parent.type.endsWith("FunctionExpression")) return
			if (argList.includes(node.name) && !usedArgs.includes(node.name)) usedArgs.push(node.name)
		}
	},
	leave(node){
		if (node.type === "ArrowFunctionExpression") afd++
	}})
	log("Total args: " + argList.length)
	for (const a of argList){
		if (!usedArgs.includes(a)) unusedArgs.push(a)
	}
	log("Unused args: " + unusedArgs.length)
	for (const f of funcs){
		const p = f.params
		let c = 1
		for (let i = f.params.length-1; i >= 0; i--) {
			if (f.params[i].type !== "Identifier") continue
			if (!unusedArgs.includes(f.params[i].name)) continue
			if (i === f.params.length-1){
				f.params.pop()
				continue
			}
			f.params[i].name = "_".repeat(c)
			c++
		}
	}
}
	log('removing "abc = abc;"')
{
	const r = {}
	estraverse.traverse(ast, {enter(node,parent){
		if (node.type === "ExpressionStatement" && node.expression.type === "AssignmentExpression" && node.expression.left.type === "Identifier" && 
		node.expression.right.type === "Identifier" && node.expression.left.name === node.expression.right.name) {
			Object.assign(node, {
				type: "VariableDeclaration",
				declarations: [eo],
				kind: "let"
			})
		}
	}})
	replaceVarsAstObj(ast, r)
}
	returncode = fromAst(ast).replaceAll(/(let|var|const) ZZZ;/g, "")
}
log('Replacing "(1, abc)()" with "abc()"') // shits useless unless it's eval
returncode = returncode.replaceAll(/\(1, ([a-zA-Z0-9_\$]+)\)\(/g, "$1(")
log('Replacing "let abc = anime({" with "anime({"')
returncode = returncode.replaceAll(/^(\t+)(let|const) [a-zA-Z0-9_\$]+ = anime\(\{/gm, "$1anime({")
if (!process.argv.includes("noflags")){
	log("Removing useless nation check")
	const varName = ((returncode.match(/^\t+[a-zA-Z0-9_\$]+\.europeanunion = true;/gm)[0]).split(".")[0]).trim()
	returncode = returncode.replace(`let${varName} = {}`, "")
	returncode = returncode.replaceAll(new RegExp(`${escapeRegExp(varName)}\\..+`, "g"), "")
	returncode = returncode.replace(new RegExp(`if \\(${escapeRegExp(varName)}.+`), "if (true) {")
}
{
	log('Replacing "abc.colors.push(0x3F057D)" with "abc.colors = [0x3F057D]"')
	const colors = []
	let varName
	const pushMatch = /^\t+([a-zA-Z0-9_\$]+)\.colors\.push\((.+)\);/gm
	for (const a of returncode.matchAll(pushMatch)){
		if (!varName) varName = a[1]
		colors.push(a[2])
	}
	returncode = returncode.replaceAll(pushMatch, "")
	returncode = returncode.replace(`${varName}.colors = [];`, `${varName}.colors = [${colors.join(", ")}];`)
}
log("Cleanup")
returncode = js_beautify(returncode, {e4x: true, indent_with_tabs: true})
{
	log('Replacing "abc.push({})" with "abc = [{}]"')
	const news = []
	let varName
	const pushMatch = /^\t+([a-zA-Z0-9_\$]+)\.push\((\{\n\t+date.+\n\t+news.+\n\t+\})\);/gm
	for (const a of returncode.matchAll(pushMatch)){
		if (!varName) varName = a[1]
		news.push(a[2])
	}
	returncode = returncode.replaceAll(pushMatch, "")
	returncode = returncode.replace(`${varName} = [];`, `${varName} = [${news.join(", ")}];`)
}
try{
	log('Replacing "abc[1] = "Alien 1"" with "abc = ["", "Alien 1"]"')
	const varName = ((returncode.match(/([a-zA-Z0-9_\$]+)\[1\] = 'Alien 1';/g)[0]).split("[")[0]).trim()
	const list = [""]
	const arrMatch = new RegExp(`^\\t+${escapeRegExp(varName)}\\[(\\d+)\\] = ('.+');`, "gm")
	for (const a of returncode.matchAll(arrMatch)){
		list[a[1]] = a[2]
	}
	returncode = returncode.replaceAll(arrMatch, "")
	returncode = returncode.replace(`const ${varName} = [];`, `const ${varName} = [${list.join(", ")}];`)
} catch(e){changeStatus("Not found")}
{
	log("Removing functions that do nothing")
	returncode = returncode.replaceAll(/\.(fail|done)\(function\(.*\) \{\s*\}\)/g, "")
	returncode = returncode.replaceAll(/\.(fail|done)\(\(.*\) => \{\s*\}\)/g, "")
	returncode = returncode.replaceAll(/\.fail\(function\(.+\) \{\s*throw new Error.+\s*\}\)/g, "")
	returncode = returncode.replaceAll(/\(?[a-zA-Z0-9_\$]*\)? => \{\s*([a-zA-Z0-9_\$]+)\(\)\s*\}/g, "$1")
	returncode = returncode.replaceAll(/[a-zA-Z0-9_\$]+\.on\([a-zA-Z0-9_\$"]+,.*\{\}\);/g, "")
}
{
	log('Replacing "if (abc) {} else {doSomething()}" with "if (!abc) {doSomething()}"')
	returncode = returncode.replaceAll(/if \(.+\) {\s*}\s*else {\s*}/g, "")
	returncode = returncode.replaceAll(/if \((.+)\) {\s*}\s*else {(.+)}/g, "if (!($1)) {$2}")
}
{
	log('Replacing "catch (abc) {" with "catch (err) {')
	returncode = returncode.replaceAll(/catch \([a-zA-Z0-9_\$]+\)/g, "catch (err)")
}
{
	log("Removing useless code") // could become problematic in the future
	returncode = returncode.replace(/[a-zA-Z0-9_\$]+\.keyUpFunctions[\s\S]+\};\s+moment/, "moment")
}
{
	log("Replacing \"const abc = class def\" with \"class abc\"")
	const matches = [...returncode.matchAll(/const ([a-zA-Z0-9_\$\[\]]+) = class ([a-zA-Z0-9_\$]+)/g)]
	returncode = returncode.replaceAll(/const ([a-zA-Z0-9_\$\[\]]+) = class [a-zA-Z0-9_\$]+/g, "class $1")
	const o = []
	const n = []
	for (const a of matches){
		o.push(a[2])
		n.push(a[1])
	}
	returncode = replaceVars(returncode, o, n)
}
function getRefCount(code, v){
	const result = []
	for (let i = 0; i < v.length; i++){
		result[i] = 0
	}
	const tokens = esprima.tokenize(code)
	let isPrevTokenDot = false
	for (const a of tokens){
		if (a.type === "Identifier"){
			const index = v.indexOf(a.value)
			if (!isPrevTokenDot && index !== -1){
				result[index]++
				continue
			}
		}
		isPrevTokenDot = a.type === "Punctuator" && a.value === "."
	}
	return result
}
{
	log("Removing duplicate constants")
	const ast = esprima.parseScript(returncode)
	const v = []
	const r = []
	const vd = []
	estraverse.traverse(ast, {enter(node, parent){
		if (node.type !== "VariableDeclaration") return
		if (parent.type.startsWith("For")) return
		for (let i = 0; i < node.declarations.length; i++){
			const d = node.declarations[i]
			if (d.init && d.init.type === "Literal"){
				if (d.id.name.length === 1) return
				v.push(d.id.name)
				r.push(d.init.raw)
				vd.push([node.declarations, i])
			}
		}
		if (node.declarations.length === 0) node.declarations[0] = eo
	}})
	const rc = []
	estraverse.traverse(ast, {enter(node, parent){
		if (node.type === "Identifier" && (
			parent.type === "UpdateExpression" || 
			parent.type === "AssignmentExpression" || 
			(parent.type === "VariableDeclarator" && parent.init))){
			const i = v.indexOf(node.name)
			if (i === -1) return
			if (!rc[i]) {
				rc[i] = 0
			}
			rc[i]++
		}
	}})
	const nv = []
	const nr = []
	const nvd = []
	for (let i = 0; i < rc.length; i++){
		if (rc[i] === 1){
			nv.push(v[i])
			nr.push(r[i])
			nvd.push(vd[i])
		}
	}
	let io = 0
	for (const a of nvd){
		a[0].splice(a[1]-io,1)
		if (a[0].length === 0) a[0][0] = eo
		io++
	}
	returncode = fromAst(ast)
	returncode = replaceVars(returncode, nv, nr).replaceAll(/^(\t+)('.*?'|-?\d+) = (.+)/gm, "$1$3").replaceAll(/\t+let (\S+) = \1;\n/g, "").replaceAll(/\t+(let|const) ZZZ;\n/g, "")
}
function generateHash(string){
	return (+string).toString(16)
}
if (false){
	log("Generating hash table for functions and classes")
	const matches = [
		/^(\t+)()function ([a-zA-Z0-9_\$]+)\(([a-zA-Z0-9_\$, ]+)\) \{[\s\S]+?\n\1\}/gm,
		/^(\t+)()function ([a-zA-Z0-9_\$]+)\(()\) \{[\s\S]+?\n\1\}/gm,
		/^(\t+)(let )?([a-zA-Z0-9_\$]+) = \(([a-zA-Z0-9_\$, ]+)\) => \{[\s\S]+?\n\1\}/gm,
		/^(\t+)(let )?([a-zA-Z0-9_\$]+) = \(()\) => \{[\s\S]+?\n\1\}/gm,
	]
	const funcs = []
	const classes = [...returncode.matchAll(/^(\t+)class [a-zA-Z0-9_\\$]+\{[\s\S]+?\n\1\}/gm)]
	const hashes = []
	const funcsToCheck = []
	for (const a of matches){
		for (const b of returncode.matchAll(a)){
		funcs.push({code: b[0], args: b[4], deepness: (b[1]).length, name: b[3]})
		funcsToCheck.push(b[3])
		}
	}
	const refCounts = getRefCount(returncode, funcsToCheck)
	for (let i = 0; i < refCounts.length; i++){
		funcs[i].refCount = refCounts[i]
	}
	let counter = 0
	const l = funcs.length + classes.length
	for (const a of funcs){
		counter++
		changeStatus(counter + "/" + l)
		const tokens = [...esprima.tokenize(a.code)]
		const ast = (esprima.parseScript(a.code)).body[0]
		let astLength
		if (!ast.body) astLength = 0
		else astLength = (ast.body.body).length
		const args = a.args.split(",")
		if (!args[0]) args.length = 0
		console.log(tokens.length,astLength,args.length,a.deepness,a.refCount)
		hashes.push({
			hash: generateHash([tokens.length,astLength,args.length,a.deepness,a.refCount].join("")),
			name: a.name
		})
	}
	writeToFile("hashTable.json", JSON.stringify(hashes, null, 1))

}
if (!process.argv.includes("nonames"))returncode = setVarNames(false, returncode)
returncode = finalCleanup(returncode)
{
	log("Validating the code")
	try{
		new Function(returncode)
	}
	catch(e){
		const filename = "invalid/alpha2s.js"
		console.log()
		console.log(e)
		log("Code is invalid. dumping the code to " + filename)
		writeToFile(filename, returncode)
		process.exit(1)
	}
}
{
	const filename = "deobfuscated/alpha2s.js"
	log("Saving deobfuscated code to " + filename)
	writeToFile(filename, returncode)
}
log(`Completed in ${((Date.now() - t) / 1000).toFixed(2)}s`)
if (!process.argv.includes("nominify")){
    log("Minifying")
    returncode = (minify(returncode, {mangle: {toplevel: true}})).code
	const filename = "deobfuscated/alpha2s.min.js"
	log("Saving minified code to " + filename)
	writeToFile(filename, returncode)
}