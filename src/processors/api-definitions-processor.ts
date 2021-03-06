import {CodeBlock} from "./code-block";
import {INTEGER_TYPE_NAME} from "./types-mapping";
import {OPTIONAL_TYPE_NAME} from "./callables-processor";
import {CoreAPI} from "./core-api-declarations";
import {processClasses} from "./classes-processor";
import {processNamespaces} from "./namespace-processor";
import {processEnums} from "./enums-processor";
import {ApiGenerationOptions} from "./types";

function addGeneralComments(fileCode: CodeBlock) {
    fileCode.add(
        "/* eslint-disable @typescript-eslint/no-unused-vars,max-len,@typescript-eslint/no-redeclare,no-trailing-spaces,no-multiple-empty-lines,@typescript-eslint/indent,@typescript-eslint/naming-convention,no-underscore-dangle,vars-on-top,no-var */",
        "// noinspection JSUnusedGlobalSymbols",
    );
}

function addPredefinedTypes(fileCode: CodeBlock) {
    fileCode.scope(`declare type ${INTEGER_TYPE_NAME} = number;`, false);
    fileCode.scope(`declare type ${OPTIONAL_TYPE_NAME}<T> = T | undefined;`, false);
}

function addGlobals(fileCode: CodeBlock) {
    fileCode
        .addAsSection("declare const script: CoreObject;")
        .comment(c => c.add("Provides access to current instance of script."))
        .addAsSection("declare function time(this: void): number;")
        .comment(c => c.add("Returns the time in seconds (floating point) since the game started on the server."))
        .addAsSection("declare function print(this: void, message: string): string;")
        .comment(c => c.add("Print a message to the event log. Access the Event Log from the Window menu."))
        .addAsSection("declare function warn(this: void, message: string): string;")
        .comment(c => c.add("Similar to print(), but includes the script name and line number."));
}

const DEFAULT_OPTIONS: ApiGenerationOptions = {
    omitDeprecated: true,
};

export async function processCoreApi({Classes, Namespaces, Enums}: CoreAPI, options: ApiGenerationOptions = DEFAULT_OPTIONS) {
    const fileCode = new CodeBlock();

    addGeneralComments(fileCode);
    addPredefinedTypes(fileCode);
    addGlobals(fileCode);

    processClasses(Classes, fileCode, options);
    processNamespaces(Namespaces, fileCode, options);
    processEnums(Enums, fileCode, options);

    return fileCode;
}
