import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const rootDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const workspaces = ['frontend', 'backend', 'contracts'];

const formatHost = {
  getCanonicalFileName: (fileName) => fileName,
  getCurrentDirectory: () => rootDirectory,
  getNewLine: () => ts.sys.newLine,
};

let hasErrors = false;

function reportDiagnostics(diagnostics) {
  process.stderr.write(ts.formatDiagnosticsWithColorAndContext(diagnostics, formatHost));
}

for (const workspace of workspaces) {
  const configPath = path.join(rootDirectory, workspace, 'tsconfig.json');
  const configFile = ts.readConfigFile(configPath, ts.sys.readFile);

  if (configFile.error) {
    reportDiagnostics([configFile.error]);
    hasErrors = true;
    continue;
  }

  const parsedConfig = ts.parseJsonConfigFileContent(
    configFile.config,
    ts.sys,
    path.dirname(configPath),
    undefined,
    configPath,
  );

  const hasNoInputsOnly =
    parsedConfig.fileNames.length === 0 &&
    parsedConfig.errors.every((diagnostic) => diagnostic.code === 18003);

  if (hasNoInputsOnly) {
    console.log(`${workspace}: no TypeScript inputs yet; skipped.`);
    continue;
  }

  if (parsedConfig.errors.length > 0) {
    reportDiagnostics(parsedConfig.errors);
    hasErrors = true;
    continue;
  }

  if (parsedConfig.fileNames.length === 0) {
    console.log(`${workspace}: no TypeScript inputs yet; skipped.`);
    continue;
  }

  const program = ts.createProgram({
    rootNames: parsedConfig.fileNames,
    options: {
      ...parsedConfig.options,
      noEmit: true,
    },
    projectReferences: parsedConfig.projectReferences,
  });

  const diagnostics = ts.getPreEmitDiagnostics(program);

  if (diagnostics.length > 0) {
    reportDiagnostics(diagnostics);
    hasErrors = true;
  } else {
    console.log(`${workspace}: typecheck passed.`);
  }
}

if (hasErrors) {
  process.exitCode = 1;
}
