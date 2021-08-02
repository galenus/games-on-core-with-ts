import fs from "fs";
import axios from "axios";
import { Class, CoreAPI, DescribableDeprecatable, Tag } from "./core-api-declarations";


const API_DEFINITIONS_URL = "https://raw.githubusercontent.com/ManticoreGamesInc/platform-documentation/development/src/assets/api/CoreLuaAPI.json";

async function loadApiDefinitions(): Promise<CoreAPI> {
    const response = await axios.get(API_DEFINITIONS_URL);
    return response.data as CoreAPI;
}

function retrieveNextItem<T>(items: Record<string, T>, itemNames: string[], name?: string): T | false {
    let currentName = name ?? itemNames.pop();
    if (!currentName) return false;

    while (!items[currentName]) {
        currentName = itemNames.pop();
        if (!currentName) return false;
    }

    return items[currentName];
}

const TAB = "    ";
const OBJECT_CLASS_NAME = "Object";
const FIRST_COMMENT_LINE = "/**";

class CodeBlock {
    private readonly code: (string | CodeBlock)[] = [];

    constructor(
        private readonly contentPrefix: string = "",
        private readonly firstLine?: string,
        private readonly lastLine?: string,
        private readonly wrapWithNewLines?: boolean,
        private readonly removeEmpty?: boolean,
    ) {
        if (!!firstLine) this.code.push(firstLine);
    }

    add(...codeLines: (string | false)[]) {
        this.code.push(...codeLines.filter(item => !!item).map(l => l + ""));
        return this;
    }

    comment() {
        if (this.code[0] instanceof CodeBlock && this.code[0].firstLine === FIRST_COMMENT_LINE) {
            return this.code[0];
        }

        const commentBlock = new CodeBlock(" * ", FIRST_COMMENT_LINE, " */");
        this.code.unshift(commentBlock);
        return commentBlock;
    }

    section(name?: string, wrapWithNewLines = false) {
        const section = new CodeBlock("", name && `// ${name}` || undefined, undefined, wrapWithNewLines, true);
        this.code.push(section);
        return section;
    }

    type(typeDeclaration: string, lastTypeLine: string | false = "}") {
        const typeBlock = new CodeBlock(TAB, typeDeclaration, lastTypeLine || undefined, true);
        this.code.push(typeBlock);

        return typeBlock;
    }

    addDescriptionAndDeprecationFor({ Description, DeprecationMessage, IsDeprecated }: DescribableDeprecatable) {
        if (!Description && !IsDeprecated) return this;

        this.comment()
            .add(Description ?? false)
            .add(IsDeprecated ? `@deprecated ${DeprecationMessage ?? ""}` : false);

        return this;
    }

    getCodeLines(): string[] {
        if (this.removeEmpty && this.code.length === 1 && this.code[0] === this.firstLine) {
            return [];
        }

        return [
            ...!!this.wrapWithNewLines ? [""]: [],
            ...this.code.flatMap(code => {
                if (code === this.firstLine) {
                    return [code];
                }

                if (code instanceof CodeBlock) {
                    return code.getCodeLines().map(line => this.contentPrefix + line);
                }

                return code.split("\n")
                    .map(line => line.replace(/^\r|\r$/g, ""))
                    .map(line => this.contentPrefix + line);
            }),
            ...!!this.lastLine ? [this.lastLine] : [],
            ...!!this.wrapWithNewLines ? [""]: []
        ];
    }

    toString() {
        return this.getCodeLines().join("\n");
    }
}

const INTEGER_TYPE_NAME = "Integer";

function mapType(type: string): string {
    switch (type) {
        case "integer": return INTEGER_TYPE_NAME;
    }

    return type;
}

function processClasses(classes: Record<string, Class>, classNames: string[], fileCode: CodeBlock) {
    let currentClass: Class | false;
    while (!!(currentClass = retrieveNextItem(classes, classNames))) {
        const classExtendsClause = currentClass.BaseType && currentClass.BaseType !== OBJECT_CLASS_NAME
            ? ` extends ${currentClass.BaseType}`
            : "";
        const classBlock = fileCode
            .type(`declare interface ${currentClass.Name}${classExtendsClause} {`)
            .addDescriptionAndDeprecationFor(currentClass);


        const propertiesSection = classBlock.section("PROPERTIES", true);
        for (const field of currentClass.Properties) {
            propertiesSection
                .section()
                .add(`${field.Tags?.includes(Tag.ReadOnly) ? "readonly " : ""}${field.Name}: ${mapType(field.Type)};`)
                .addDescriptionAndDeprecationFor(field);
        }

        if (!!currentClass.Constants || !!currentClass.StaticFunctions) {
            const staticTypeName = `${currentClass.Name}Static`;
            const staticClassBlock = fileCode.type(`declare interface ${staticTypeName} {`);

            const constantsSection = staticClassBlock.section("CONSTANTS", true);
            for (const constant of currentClass?.Constants ?? []) {
                constantsSection
                    .section()
                    .add(`readonly ${constant.Name}: ${mapType(constant.Type)};`)
                    .addDescriptionAndDeprecationFor(constant);
            }

            fileCode.add(`declare const ${currentClass.Name}: ${staticTypeName};`)
        }
    }

    return fileCode;
}

function addCommonTypes(fileCode: CodeBlock) {
    fileCode.type(`declare type ${INTEGER_TYPE_NAME} = number;`, false);
    return fileCode;
}

async function processCoreApi({Classes, Namespaces, Enums}: CoreAPI) {
    const {classes, classNames} = Classes.reduce(
        ({ classes, classNames }, clazz) => ({
            classes: {...classes, [clazz.Name]: clazz },
            classNames: [...classNames, clazz.Name ]
        }),
        {classes: {} as Record<string, Class>, classNames: [] as string[]}
    );
    let fileCode = new CodeBlock();
    fileCode = addCommonTypes(fileCode);
    fileCode = processClasses(classes, classNames, fileCode);

    return fileCode;
}

loadApiDefinitions()
    .then(processCoreApi)
    .then(result => fs.writeFileSync("./generated-definitions.d.ts", result.toString()))
    .then(() => console.log("Done!"))
    .catch(e => console.error("Failed with an error:", e));