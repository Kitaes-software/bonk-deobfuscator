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
const crypto = require('crypto');
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
const ml = []
let mc = -1
function removeMaps(code){
	const match = /push\(('|")(1|2),.+('|")\)/g
	for (const a of [...code.matchAll(match)]){
		ml.push(a[0])
	}
	return code.replaceAll(match, function(e){
		mc++
		return "map" + mc
	})
}
function returnMaps(code){
	return code.replaceAll(/map\d+/g, (e) => ml[e.slice(3)])
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
				if (!args[i]) continue
				replacements[fName + "a" + i] = args[i]
			}
		}
		delete funcr.args
		for (const n of Object.keys(funcr)){
			replacements[fName + "v" + n] = funcr[n]
		}
	}
	log("Renamed variables: " + Object.keys(replacements).length)
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
	code = js_beautify(code, {indent_with_tabs: true})
	const found = code.slice(0,10).indexOf("requirejs") !== -1
	const tmp = code.split("\n")
	for (const i in tmp){
		if (tmp[i].startsWith("\t") && found) tmp[i] = tmp[i].slice(1)
		if (tmp[i].startsWith(" ")) tmp[i] = tmp[i].slice(1)
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
log("Checking for cache")
let returncode
let ast
if (process.argv.includes("nocache") || !fs.existsSync("cache/1.js")){
    log("Cache not found, starting")
    function initialDeobfuscation(code) {
        ast = esprima.parseScript(code)
        log("Code parsed")
        function getMainFunctionName(ast) {
            for (let node of ast.body) {
                if (
					node.type === "ExpressionStatement" && 
					node.expression.type === "AssignmentExpression" && 
					node.expression.left.type === "MemberExpression" &&
					node.expression.left.object.type === "Identifier"
					) {
                    return node.expression.left.object.name
                }
            }
            return null
        }
    
        function getMainArray(ast) {
            a: for (let node of ast.body) {
                if (node.type === "ExpressionStatement" && node.expression.type === "AssignmentExpression") {
                    const right = node.expression.right
                    if (right && right.type === "ArrayExpression") {
                        if (node.expression.left.type === "Identifier") {
                            for (const element of right.elements) {
                                if (!(
                                    element.type === "CallExpression" && 
                                    element.callee.type === "MemberExpression" && 
                                    element.callee.object.name === MAINFUNCTION &&
                                    element.arguments.length === 1 &&
                                    typeof element.arguments[0].value === "number"
                                )){
                                    stringGetterFunctionNames.length = 0
                                    continue a
                                }
                                if (!stringGetterFunctionNames.includes(element.callee.property.name)) {
                                    stringGetterFunctionNames.push(element.callee.property.name)
                                }
                            }
                            return node.expression.left.name
                        }
                    }
                }
            }
            return null
        }
    
        const MAINFUNCTION = getMainFunctionName(ast)
        if (MAINFUNCTION == null) {
            log("MAINFUNCTION not found, probably not obfuscated")
            return
        }
        const stringGetterFunctionNames = []
        const MAINARRAY = getMainArray(ast)
		let filteredObfCode = []
		const funcsToFilter = [MAINFUNCTION]
		function filterCode(node){
			filteredObfCode.push(ast.body.splice(ast.body.indexOf(node), 1)[0])
		}
		let x = true
		for (let i = 0; i < ast.body.length; i++) {
			function filter(index, count = 1){
				filteredObfCode.push(...ast.body.splice(index, count))
				i -= count
			}
			const node = ast.body[i]
			if (node.type === "ExpressionStatement" && node.expression.type === "CallExpression"){
				const ex = node.expression
				if (!ex.arguments[0]) continue
				const arg = ex.arguments[0]
				if (x && arg.type === "CallExpression" && arg.callee.name.length === 4 && ex.callee.name.length === 4){
					filter(i)
					funcsToFilter.push(ex.callee.name)
					funcsToFilter.push(arg.callee.name)
				}
				else x = false
				if (arg.type === "MemberExpression"){
					if (arg.object.name === MAINFUNCTION){
						filter(i)
						funcsToFilter.push(ex.callee.name)
					}
				}
			}
			else if (node.type === "ExpressionStatement" && node.expression.type === "AssignmentExpression") {
				const left = node.expression.left
				const right = node.expression.right
				if (right.type === "Identifier") funcsToFilter.push(right.name)
				else if (right.type === "CallExpression") {
					if (right.callee.type === "Identifier") funcsToFilter.push(right.callee.name)
				}
				if (left.type === "MemberExpression"){
					if (left.object.name === MAINFUNCTION){
						filter(i)
					}
					else if (left.object.type === "MemberExpression" && left.object.object.name === MAINFUNCTION){
						filter(i)
					}
				}
				else if (left.type === "Identifier" && left.name === MAINARRAY){
					filter(i)
				}
			}
			else if (node.type === "VariableDeclaration"){
				if (node.declarations[0].id.name === MAINARRAY) {
					filter(i)
				}
			}
			else if (node.type === "FunctionDeclaration"){
				if (funcsToFilter.includes(node.id.name)) {
					filter(i)
				}
			}
			else if (node.type === "ForStatement"){
				if (!node.init && !node.update && node.test && node.test.type === "BinaryExpression"){
					const prevNode = ast.body[i-1]
					if (prevNode.type === "VariableDeclaration"){
						filter(i-1, 2)
					}
				}
			}
		}
		filteredObfCode = {type: "Program", body: filteredObfCode}
		const obfCode = escodegen.generate(filteredObfCode)
        const mainFunctionNames = [MAINFUNCTION]
        const mainArrayNames = [MAINARRAY]
		let MAINFUNCTIONEVAL, MAINARRAYEVAL
		const c = `const window=globalThis;${obfCode};`;
		if (!MAINARRAY){
			const sandboxCode = new Function(`${c}return ${MAINFUNCTION}`);
        	MAINFUNCTIONEVAL = sandboxCode()
		}
		else{
        	const sandboxCode = new Function(`${c}return [${MAINFUNCTION}, ${MAINARRAY}]`);
        	[MAINFUNCTIONEVAL, MAINARRAYEVAL] = sandboxCode()
		}
        let scopeStack = []
        let globalScope = {}
    
        function resolveVariable(name) {
            for (let i = scopeStack.length - 1; i >= 0; i--) {
                const scope = scopeStack[i]
                if (scope[name]) {
                    return scope[name]
                }
            }
            return globalScope[name] || null
        }
        function getNodeValue(node){
            if (node.type === "Identifier") {
                return node.name
            } else if (node.type === "MemberExpression" && node.object.type === "Identifier" && node.property.type === "Literal") {
                return `${node.object.name}[${node.property.value}]`
            }
        }
        function scopePush(node, id){
            const chk = id ? "Identifier" : "Literal"
            const prop = id ? "name" : "value"
            if (node.type === "FunctionDeclaration" || node.type === "FunctionExpression") {
                scopeStack.push({})
            }
            if (node.type === "VariableDeclarator") {
                const currentScope = scopeStack[scopeStack.length - 1] || globalScope
                if (node.init && node.init.type === chk) {
                    currentScope[node.id.name] = node.init[prop]
                }
            }
            if (node.type === "AssignmentExpression") {
                const currentScope = scopeStack[scopeStack.length - 1] || globalScope
                if (node.right.type === "UnaryExpression" && node.right.operator === "-" && node.right.argument.type === chk){
                    currentScope[getNodeValue(node.left)] = -node.right.argument[prop]
                }
                if (node.right.type === chk) {
                    currentScope[getNodeValue(node.left)] = node.right[prop]
                }
            }
        }
        function scopePop(node){
            if (node.type === "FunctionDeclaration" || node.type === "FunctionExpression") {
                scopeStack.pop()
            }
        }
        // Finding alternative names
		estraverse.replace(ast, {enter(node){
			if (node.type === "ExpressionStatement" && node.expression.type === "AssignmentExpression") {
				const ex = node.expression
				if (!getNodeValue(ex.left)) return
				if (mainArrayNames.includes(ex.right.name)){
					mainArrayNames.push(getNodeValue(ex.left))
					this.remove()
				}
				else if (mainFunctionNames.includes(ex.right.name)){
					mainFunctionNames.push(getNodeValue(ex.left))
					this.remove()
				}
			}
			else if (node.type === "VariableDeclaration"){
				for (let i = 0; i < node.declarations.length; i++){
					const dec = node.declarations[i]
					if (!(dec.init && dec.init.type === "Identifier")) return
					if (mainArrayNames.includes(dec.init.name)){
						mainArrayNames.push(dec.id.name)
					}
					else if (mainFunctionNames.includes(dec.init.name)){
						mainFunctionNames.push(dec.id.name)
					}
					else return
					node.declarations.splice(i, 1)
					i--
				}
				if (node.declarations.length === 0) this.remove()
			}
		}})
        // Get Math Operation Property Name
        let mathGetterPropertyName, mathSetterPropertyName, mathSwitch
        estraverse.replace(filteredObfCode, {
            enter(node) {
                if (node.type === "ObjectExpression" && node.properties.length === 2) {
                    const firstNode = node.properties[0]
                    const secondNode = node.properties[1]
                    if (firstNode.key.type === "Identifier" && firstNode.value.type === "FunctionExpression" && firstNode.value.body.type === "BlockStatement") {
                        const body = firstNode.value.body.body
                        for (const element of body) {
                            if (element.type === "SwitchStatement") {
                                mathGetterPropertyName = firstNode.key.name
                                mathSetterPropertyName = secondNode.key.name
                                mathSwitch = element
                            }
                        }
                    }
                }
            }
        })
        if (mathGetterPropertyName == null || mathSetterPropertyName == null || mathSwitch == null) {
            log("Math Operation not found")
            return
        }
    
        // Get Math Operation Function Name
        const mathGetterFunctionNames = []
        const mathSetterFunctionNames = []
        for (let node of filteredObfCode.body) {
            if (node.type === "ExpressionStatement") node = node.expression
            if (node.type === "AssignmentExpression") {
                if (
                    node.left.type === "MemberExpression" &&
                    node.left.object.type === "Identifier" &&
                    mainFunctionNames.includes(node.left.object.name) &&
                    node.left.property.type === "Identifier" &&
                    node.right.type === "FunctionExpression" &&
                    node.right.body.type === "BlockStatement" &&
                    node.right.body.body.length === 1 &&
                    node.right.body.body[0].type === "ReturnStatement" &&
                    node.right.body.body[0].argument.type === "ConditionalExpression" &&
                    node.right.body.body[0].argument.alternate.type === "MemberExpression" &&
                    node.right.body.body[0].argument.alternate.property &&
                    node.right.body.body[0].argument.alternate.property.type === "Identifier"
                ) {
                    if (node.right.body.body[0].argument.alternate.property.name === mathGetterPropertyName) {
                        mathGetterFunctionNames.push(node.left.property.name)
                    }
                    if (node.right.body.body[0].argument.alternate.property.name === mathSetterPropertyName) {
                        mathSetterFunctionNames.push(node.left.property.name)
                    }
                }
            }
        }
        // FROM: mathSetterFunctionNames(0); var a = mathGetterFunctionNames(1, 2); var b = mathGetterFunctionNames(variable1, 1)
        // TO: var a = 1; var b = 1 - variable1
        let tmpMathSetterArg
        estraverse.replace(ast, {
            enter(node) {
                if (node.type === "CallExpression") {
                    if (
                        node.callee.type === "MemberExpression" &&
                        node.callee.object.type === "Identifier" &&
                        mainFunctionNames.includes(node.callee.object.name) &&
                        node.callee.property.type === "Identifier"
                    ) {
                        if (mathSetterFunctionNames.includes(node.callee.property.name)) {
                            tmpMathSetterArg = node.arguments[0].value
                        } else if (mathGetterFunctionNames.includes(node.callee.property.name)) {
                            let argsAllLiteral = true
                            const args = []
                            const argsValue = []
    
                            for (const arg of node.arguments) {
                                args.push(arg)
                                if (arg.type !== "Literal") {
                                    argsAllLiteral = false
                                    if (
                                        arg.type === "CallExpression" && 
                                        arg.callee.type === "MemberExpression" &&
                                        mainFunctionNames.includes(arg.callee.object.name) &&
                                        mathSetterFunctionNames.includes(arg.callee.property.name)
                                    ){
                                        tmpMathSetterArg = arg.arguments[0].value // order of execution
                                    }
                                } else {
                                    argsValue.push(arg.value)
                                }
                            }
    
                            if (argsAllLiteral) {
                                MAINFUNCTIONEVAL[mathSetterFunctionNames[0]](tmpMathSetterArg)
                                const result = MAINFUNCTIONEVAL[mathGetterFunctionNames[0]](...argsValue)
                                if (result >= 0) {
                                    return {
                                        type: "Literal",
                                        value: result,
                                        raw: String(result)
                                    }
                                } else {
                                    return {
                                        type: "UnaryExpression",
                                        operator: "-",
                                        prefix: true,
                                        argument: {
                                            type: "Literal",
                                            value: Math.abs(result),
                                            raw: String(Math.abs(result))
                                        }
                                    }
                                }
                            } else {
                                for (const switchCase of mathSwitch.cases) {
                                    if (switchCase.test.value === tmpMathSetterArg) {
                                        let BinaryExpression = JSON.parse(JSON.stringify(switchCase.consequent[0].expression.right))
                                        estraverse.traverse(BinaryExpression, {enter(node){
                                            if (node.type === "MemberExpression"){
                                                Object.assign(node, args[node.property.value])
                                                this.skip()
                                            }
                                        }})
                                        return BinaryExpression
                                    }
                                }
                            }
                        }
                    }
                }
            }
        })
		if (stringGetterFunctionNames.length === 0){
			let stringGetterPropertyName
			for (let node of filteredObfCode.body){
				if (
					node.type === "ExpressionStatement" &&
					node.expression.type === "AssignmentExpression" &&
					node.expression.left.type === "MemberExpression" &&
					node.expression.left.object.name === MAINFUNCTION &&
					node.expression.right.type === "CallExpression" &&
					node.expression.right.callee.type === "FunctionExpression" &&
					node.expression.right.callee.body.type === "BlockStatement"
					){
					estraverse.traverse(node.expression.right.callee.body, {enter(node,parent){
						if (
							node.type === "CallExpression" && 
							node.arguments.length === 1 &&
							node.arguments[0].type === "Literal" &&
							typeof node.arguments[0].value === "string" &&
							node.arguments[0].value.length === 6
							){
							stringGetterPropertyName = parent.key.name
						}
					}})
				}
			}
			if (stringGetterPropertyName){
				for (let node of filteredObfCode.body) {
					if (node.type === "ExpressionStatement") node = node.expression
					if (node.type === "AssignmentExpression") {
						if (
							node.left.type === "MemberExpression" &&
							node.left.object.type === "Identifier" &&
							mainFunctionNames.includes(node.left.object.name) &&
							node.left.property.type === "Identifier" &&
							node.right.type === "FunctionExpression" &&
							node.right.body.type === "BlockStatement" &&
							node.right.body.body.length === 1 &&
							node.right.body.body[0].type === "ReturnStatement" &&
							node.right.body.body[0].argument.type === "ConditionalExpression" &&
							node.right.body.body[0].argument.alternate.type === "MemberExpression" &&
							node.right.body.body[0].argument.alternate.property &&
							node.right.body.body[0].argument.alternate.property.type === "Identifier" &&
							node.right.body.body[0].argument.alternate.property.name === stringGetterPropertyName
						) {
							stringGetterFunctionNames.push(node.left.property.name)
						}
					}
				}
			}
		}
        // FROM: var a = stringGetterFunctionName(10); var a = MAINARRAY[10]
        // TO: var a = "real string value"
        // Remove Literal = Literal
        // Remove if (true)
        scopeStack = []
        globalScope = {}
        function ret(res,node,parent){
            if (parent.type === "MemberExpression" && parent.object !== node){
                parent.computed = false
                return {
                    type: "Identifier",
                    name: res
                }
            }
            return {
                type: "Literal",
                value: res
            }
        }
        estraverse.replace(ast, {
            enter(node, parent) {
                scopePush(node)
                if (node.type === "CallExpression") {
                    if (
                        node.callee.type === "MemberExpression" &&
                        node.callee.object.type === "Identifier" &&
                        mainFunctionNames.includes(node.callee.object.name) &&
                        node.callee.property.type === "Identifier"
                    ) {
                        if (stringGetterFunctionNames.includes(node.callee.property.name)) {
                            if (node.arguments[0].type === "Literal") {
                                const result = MAINFUNCTIONEVAL[stringGetterFunctionNames[0]](node.arguments[0].value)
                                return ret(result,node,parent)
                            } else if (node.arguments[0].type === "Identifier") {
                                const resolved = resolveVariable(node.arguments[0].name)
                                if (resolved !== null && resolved.toString() !== "NaN" && typeof resolved === "number") {
                                    if (resolved >= 0) {
                                        const result = MAINFUNCTIONEVAL[stringGetterFunctionNames[0]](resolved)
                                        return ret(result,node,parent)
                                    }
                                }
                            } else if (
                                node.arguments[0].type === "MemberExpression" &&
                                node.arguments[0].object.type === "Identifier" &&
                                node.arguments[0].property.type === "Literal"
                            ) {
                                const resolved = resolveVariable(`${node.arguments[0].object.name}[${node.arguments[0].property.value}]`)
                                if (resolved !== null && resolved.toString() !== "NaN" && typeof resolved === "number") {
                                    if (resolved >= 0) {
                                        const result = MAINFUNCTIONEVAL[stringGetterFunctionNames[0]](resolved)
                                        return ret(result,node,parent)
                                    }
                                }
                            }
                        }
                    }
                }
                else if (
                    node.type === "MemberExpression" && 
                    (node.object.type === "Identifier" || node.object.type === "MemberExpression") && 
                    mainArrayNames.includes(getNodeValue(node.object))
                ) {
                    if (node.property.type === "Literal") {
                        const result = MAINARRAYEVAL[node.property.value]
                        if (result == null) {
                            // null main array
                        } else {
                            return ret(result,node,parent)
                        }
                    } else if (node.property.type === "Identifier") {
                        const resolved = resolveVariable(node.property.name)
                        if (resolved !== null && resolved.toString() !== "NaN" && typeof resolved === "number") {
                            if (resolved >= 0) {
                                const result = MAINARRAYEVAL[resolved]
                                if (result == null) {
                                    // null main array
                                } else {
                                    return ret(result,node,parent)
                                }
                            }
                        }
                    } else if (node.property.type === "MemberExpression" && node.property.object.type === "Identifier" && node.property.property.type === "Literal") {
                        const resolved = resolveVariable(`${node.property.object.name}[${node.property.property.value}]`)
                        if (resolved !== null && resolved.toString() !== "NaN" && typeof resolved === "number") {
                            if (resolved >= 0) {
                                const result = MAINARRAYEVAL[resolved]
                                if (result == null) {
                                    // null main array
                                } else {
                                    return ret(result,node,parent)
                                }
                            }
                        }
                    }
                }
                else if (node.type === "ExpressionStatement" && node.expression.type === "AssignmentExpression") {
                    const left = node.expression.left
                    const right = node.expression.right
                    if (left.type === "Identifier" && right.type === "Identifier" && left.name === right.name) {
                        this.remove()
                    } else if (left.type === "Literal" && right.type === "Literal" && left.value === right.value) {
                        this.remove()
                    }
                }
                else if (node.type === "IfStatement"){
                    let test = node.test
                    if (test.type === "UnaryExpression" && test.operator === "!"){
                        test = test.argument
                    }
					if (test.right && test.right.type === "UnaryExpression" && test.right.operator === "!") {
						test.right = test.right.argument
					}
                    if (
                        test.type === "LogicalExpression" && ((
							test.right.type === "BinaryExpression" &&
                        	test.right.left.type === "CallExpression" && 
                        	test.right.left.callee.type === "MemberExpression" &&
                        	mainFunctionNames.includes(test.right.left.callee.object.name) &&
                        	test.right.left.arguments && 
                        	test.right.left.arguments.length === 3 &&
                        	test.right.left.arguments[0].value === 0 &&
                        	test.right.left.arguments[1].value === false &&
                        	typeof test.right.left.arguments[2].value === "number"
						) || (
							test.right.type === "CallExpression" &&
							test.right.callee.type === "MemberExpression" &&
                        	mainFunctionNames.includes(test.right.callee.object.name)
						))
                    ) {
                        const index = parent.body.indexOf(node)
                        parent.body.splice(index, 1, ...node.consequent.body)
                    }
                }
                else if (node.type === "EmptyStatement") this.remove()
            }, scopePop
        })
        scopeStack = []
        globalScope = {}
        // Remove MAINFUNCTION.abc(); 
		estraverse.replace(ast, {enter(node,parent){
			if (
                node.type === "ExpressionStatement" && 
                node.expression.type === "CallExpression" &&
                node.expression.callee.type === "MemberExpression" &&
                mainFunctionNames.includes(node.expression.callee.object.name)
                ) this.remove()
		}})
        // Remove code traps
        estraverse.replace(ast, {enter(node, parent){
            scopePush(node)
            if (
                node.type === "ForStatement" &&
                node.test.type === "BinaryExpression" && 
                node.test.operator === "!==" &&
                node.test.left.type === "CallExpression" &&
                node.test.left.callee.type === "MemberExpression" &&
                mainFunctionNames.includes(node.test.left.callee.object.name)
                ) {
                    let resultAst = []
                    const funcCall = node.test.left
                    const idx = parent.body.indexOf(node)
					let ifs
					for(let i = idx+1; !ifs || ifs.type !== "IfStatement"; i++){
						ifs = parent.body[i]
					}
                    if (
                        MAINFUNCTIONEVAL[funcCall.callee.property.name]("1", 1, funcCall.arguments[2].value) !== 
                        resolveVariable(getNodeValue(node.test.right))
                        ){
                            const lastStatement = node.body.body[node.body.body.length-1]
                            if (lastStatement && lastStatement.type !== "ReturnStatement") resultAst = node.body.body.slice(0,-1)
                            else resultAst = node.body.body
                        }
                    else if (
						MAINFUNCTIONEVAL[funcCall.callee.property.name]("2", 1, ifs.test.left.arguments[2].value) !== 
						resolveVariable(getNodeValue(ifs.test.right))
						){
                        resultAst = ifs.consequent.body
                    }
                    parent.body.splice(idx, 2, ...resultAst)
                }
        }, scopePop})
        // Generate updated code
        return fromAst(ast)
    }
    returncode = removeMaps(initialDeobfuscation(response))
    writeToFile("cache/1.js", returncode)
}
else{
	returncode = removeMaps(fs.readFileSync("cache/1.js", {encoding: "utf8"}))
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
try{
	log('Deobfuscating packets')
	const varName = (returncode.match(/[a-zA-Z0-9_\$\[\]]+ = \(1, [a-zA-Z0-9_\$\[\]]+\)\([a-zA-Z0-9_\$\[\]]+, \{\s+reconnection/)[0]).split(" = ")[0]
	for (const a of returncode.matchAll(new RegExp(escapeRegExp(varName) + "\\.(on|emit)\\(([a-zA-Z0-9_\\$\\[\\]]+)", "g"))){
		const match = returncode.match(new RegExp(`${escapeRegExp(a[2])} = .+;`))
		if (!match) continue
		const varValue = match[0].split(" = ")[1].replace(";", "")
		returncode = returncode.replace(`${a[2]} = ${varValue};`, "")
		returncode = returncode.replaceAll(a[2], varValue)
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
    function makeSafeAst(ast){
		estraverse.traverse(ast, {enter(node, parent){
            if (node.type === "Identifier" && !(parent.type === "MemberExpression" && parent.property === node && !parent.computed)){
                if (node.name.startsWith("f")  && !isNaN(parseInt(node.name[1])))node.name = "_" + node.name
            }
        }})
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
		if (!node) return
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
			// global scope exists for some reason, do not touch it
			if (ast.body.indexOf(parent) !== -1) return
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
		// function in global scope, do not touch
		if (parent === ast) return
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
	log("Removing unused functions")
{
	let unc = 1
	while (unc > 0) {
		unc = 0
		const funcs = {}
		const emptyFuncs = []
		estraverse.traverse(ast, {enter(node, parent){
			if (node.type === "FunctionDeclaration" && node.id.name && parent !== ast){
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
			// if (vars[node.name].scopes.length < vars[node.name].is.length) {
			// 	vars[node.name].scopes = vars[node.name].is
			// 	return
			// }
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
	log('Replacing "abc" with "element" in "let abc = document.getElementById("element")"') // 80 characters damn, i barely managed to make it fit
{
	const r = {}
	const l = []
	estraverse.traverse(ast, {enter(node,parent){
		if (node.type !== "VariableDeclarator" || !node.init) return
		if (!(node.init.type === "CallExpression" && node.init.callee.type === "MemberExpression")) return
		if (!(node.init.callee.object.name === "document" && node.init.callee.property.name === "getElementById")) return
		let nn = "el_" + (node.init.arguments[0].value).replaceAll("-", "minus")
		if (l.includes(nn)){
			nn += "_"
		}
		l.push(nn)
		r[node.id.name] = nn
	}})
	replaceVarsAstObj(ast, r)
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
if (!process.argv.includes("noflags")){ try{
	log("Removing useless nation check")
	const varName = ((returncode.match(/^\t+[a-zA-Z0-9_\$]+\.europeanunion = true;/gm)[0]).split(".")[0]).trim()
	returncode = returncode.replace(`let${varName} = {}`, "")
	returncode = returncode.replaceAll(new RegExp(`${escapeRegExp(varName)}\\..+`, "g"), "")
	returncode = returncode.replace(new RegExp(`if \\(${escapeRegExp(varName)}.+`), "if (true) {")
} catch(e){
	log("Nation check not found")
}}
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
	returncode = returncode.replaceAll(/[a-zA-Z0-9_\$]+\.on\([a-zA-Z0-9_\$"']+,.*\{\}\);/g, "")
	returncode = returncode.replaceAll(/\(?([a-zA-Z0-9_\$, ]+)\)? => \{[\s\n]+([a-zA-Z0-9_\$]+)\(\1\);?[\s\n]+\}/g, "$2")
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
log("Renumbering variables")
{
    const ast = esprima.parseScript(returncode)
    makeSafeAst(ast)
    const replacements = {}
    let functionCounter = -1
    const varCounters = {}
    const funcScopeIds = []
    let shouldCount = true
    function renameArgs(node){
		for (let i = 0; i < node.params.length; i++){
			replacements[getArgName(node.params[i])] = "f" + functionCounter + "a" + i
		}
	}
    function getArgName(node){
        if (node.type === "RestElement") node = node.argument
        else if (node.type === "AssignmentPattern") node = node.left
        return node.name
    }
    estraverse.traverse(ast, {enter(node, parent){
        if (
            node.type === "FunctionDeclaration" ||
            node.type === "FunctionExpression" ||
            node.type === "ArrowFunctionExpression"
        ) {
            if (shouldCount) functionCounter++
            varCounters[functionCounter] = 0
            funcScopeIds.push(functionCounter)
            if (node.id || node.params.length > 0) shouldCount = true
            else shouldCount = false
            const newFname = "f" + functionCounter
            if (node.id && parent !== ast) replacements[node.id.name] = newFname
            renameArgs(node)
        }
        else if (
            (node.type === "VariableDeclarator" ||
            node.type === "ClassDeclaration") 
            && /^_f\d+(v\d+)?$/.test(node.id.name)
            ){
			if (funcScopeIds.length === 0) return
            shouldCount = true
            const fi = funcScopeIds[funcScopeIds.length-1]
            if (!replacements[node.id.name]) replacements[node.id.name] = `f${fi}v${varCounters[fi]}`
            varCounters[fi]++
        }
    }, leave(node){
        if (
            node.type === "FunctionDeclaration" ||
            node.type === "FunctionExpression" ||
            node.type === "ArrowFunctionExpression"
        ) {
            funcScopeIds.pop()
        }
    }})
    replaceVarsAstObj(ast, replacements)
    log("Removing duplicate constants")
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
	return crypto.createHash('sha256').update(string).digest('hex');
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
returncode = returnMaps(finalCleanup(returncode))
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