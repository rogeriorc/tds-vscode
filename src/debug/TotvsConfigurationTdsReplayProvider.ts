import { WorkspaceFolder, DebugConfigurationProvider, DebugConfiguration, CancellationToken, ProviderResult, window } from 'vscode';
import * as vscode from 'vscode';
import {localize} from '../extension';
import { setDapArgs } from './debugConfigs';
const fs = require('fs');

/*
 * Set the following compile time flag to true if the
 * debug adapter should run inside the extension host.
 * Please note: the test suite does no longer work in this mode.
 */
export class TotvsConfigurationTdsReplayProvider implements DebugConfigurationProvider {
	static type = 'totvs_tdsreplay_debug';

	/**
	 * Massage a debug configuration just before a debug session is being launched,
	 * e.g. add all missing attributes to the debug configuration.
	 */
	//resolveDebugConfiguration(folder: WorkspaceFolder | undefined, config: DebugConfiguration, token?: CancellationToken): ProviderResult<DebugConfiguration> {
	async resolveDebugConfiguration(folder: WorkspaceFolder | undefined, config: DebugConfiguration, token?: CancellationToken): Promise<ProviderResult<DebugConfiguration>> {
		if (config.tdsReplayFile !== undefined && config.tdsReplayFile.trim().length != 0) {

			let workspaceFolders = vscode.workspace.workspaceFolders;
			if (workspaceFolders) {
				let wsPaths = new Array(workspaceFolders.length);
				let i = 0;
				for (const workspaceFolder of workspaceFolders) {
					const workspaceFolderPath = workspaceFolder.uri.fsPath;
					wsPaths[i] = workspaceFolderPath;
					i++;
				}
				config.workspaceFolders = wsPaths;
			}

			if (!config.cwb || (config.cwb === '')) {
				config.cwb = vscode.workspace.rootPath;
				window.showInformationMessage(localize('tds.vscode.cwb_warning', 'Parameter cwb not informed. Setting to {0}', config.cwb));
			}

			let setDapArgsArr: string[] =  [];

			if (config.waitForAttach) {
				setDapArgsArr.push("--wait-for-attach=" + config.waitForAttach);
			}

			if (config.logFile) {
				const ws: string = vscode.workspace.rootPath || '';
				setDapArgsArr.push("--log-file=" + config.logFile.replace('${workspaceFolder}', ws));
			}

			// setDapArgsArr.push("--tdsReplayFile=" + config.tdsReplayFile); //Atenção, esse comando deve ser usado apenas em aplicações baseadas em DAP.

			// let mustImport;
			// await this.verifyIfMustImport(config).then((value) => {mustImport = value});
			// if(mustImport) {
			// 	//--importTDSReplay=<The compacted File> --password=teste --include=<Source list to include> --enableVerbose --logFile=D:\temp\testeNewReplay\importLog.txt			setDapArgs(setDapArgsArr);
			// 	setDapArgsArr.push("--import");
			// 	if(config.password !== undefined && config.password.trim().length > 0) {
			// 		setDapArgsArr.push("--password=" + config.password);
			// 	}
			// 	if(config.includeSources !== undefined && config.includeSources.trim().length > 0) {
			// 		setDapArgsArr.push("--include=" + config.includeSources);
			// 	}
			// 	if(config.excludeSources !== undefined && config.excludeSources.trim().length > 0) {
			// 		setDapArgsArr.push("--exclude=" + config.excludeSources);
			// 	}
			// 	if(config.enableVerbose !== undefined && config.enableVerbose) {
			// 		setDapArgsArr.push("--enableVerbose=" + config.enableVerbose);
			// 		if (config.logFile) {
			// 			const ws: string = vscode.workspace.rootPath || '';
			// 			setDapArgsArr.push("--logFile=" + config.logFile.replace('${workspaceFolder}', ws));
			// 		}
			// 	}
			// }
			// setDapArgsArr.push("--keepExtractedFiles"); //NAO COMITAR COM ESSA OPCAO

			setDapArgs(setDapArgsArr);

			return config;
		} else {
			window.showErrorMessage(localize('tds.vscode.tdsReplay.fileNotInformed', "Arquivo do TDS Replay não informado"));
			return null;
		}
	}

	dispose() {
	}

	async verifyIfMustImport(config: DebugConfiguration): Promise<boolean> {
		config.tdsReplayFile = config.tdsReplayFile.replace(/\\/g,'/');
		const replayFileLocation = this.getReplayFileLocation(config.tdsReplayFile);
		//CAso nao encontre a pasta temporaria informada no mapa, é necessario atualizar o arquivo .dbmap com a nova pasta.
		let mustImport = replayFileLocation.trim().length == 0 || !fs.existsSync(replayFileLocation);
		if(!mustImport) {
			const dbFile = replayFileLocation.concat("/tmp.rpl");
			const filterFile = replayFileLocation.concat("/.lastFilter");
			if(fs.existsSync(dbFile)) {
				if(fs.existsSync(filterFile)) {
					let isTheSameFilter = this.compareFilter(filterFile, config);
					if(!isTheSameFilter) {
						await this.askIfMustReImportTDSReplay().then(value => mustImport = value);
					}
				} else {
					mustImport = true;
				}
				if(mustImport) {
					vscode.window.showInformationMessage(localize('tds.vscode.tdsReplay.deletingDbFile', 'Cleaning current database...'));
					fs.unlinkSync(dbFile);
					vscode.window.showInformationMessage(localize('tds.vscode.tdsReplay.dbDeleted', 'Current database cleaned.'));
				}
			} else {
				mustImport = true;
			}
			this.updateLastFilterFile(config, filterFile, mustImport);
		}
		return mustImport;
	}

	getReplayFileLocation(tdsReplayFile: string): String {
		let tdsReplayFileLocation = "";
		const homedir = require('os').homedir();
		const tdsReplayFolder = homedir.concat("\\.tdsreplay");
		if (fs.existsSync(tdsReplayFolder)) {
			const dbMapFile = tdsReplayFolder.concat("\\.dbmap");
			if (fs.existsSync(dbMapFile)) {
				//ler o arquivo .dbmap para pegar o local onde deve estar o arquivo do tds replay
				let json = fs.readFileSync(dbMapFile).toString();
				let jsonParsed = JSON.parse(json);
				//A rotina abaixo é um exemplo de como ler um json sem saber explicitamente as chaves...
				//for(var exKey in jsonParsed) {
				//	console.log("key:"+exKey+", value:"+jsonParsed[exKey]);
				//	console.log("");
				//}
				if(jsonParsed.hasOwnProperty(tdsReplayFile)) {
					tdsReplayFileLocation = jsonParsed[tdsReplayFile];
				}
			}
		}
		return tdsReplayFileLocation;
	}

	compareFilter(filterFile: string, config: DebugConfiguration) : boolean {
		let isTheSameFilter = true;
		let lastIncludeFilterUsed;
		let lastExcludeFilterUsed;
		var allLines = fs.readFileSync(filterFile).toString().split("\n");
		if(allLines !== undefined && allLines.length > 0) {
			if(allLines.length > 2) {
				lastIncludeFilterUsed = allLines[1];
			}
			if(allLines.length > 3) {
				lastExcludeFilterUsed = allLines[3];
			}
		}
		isTheSameFilter = lastIncludeFilterUsed == config.includeSources && lastExcludeFilterUsed == config.excludeSources;
		return isTheSameFilter;
	}

	async askIfMustReImportTDSReplay(): Promise<boolean> {
		let mustReimport = false;
		//const textNoAsk = localize('tds.vscode.noAskAgain', "Don't ask again");
		const textNo = localize('tds.vscode.no', 'No');
		const textYes = localize('tds.vscode.yes', 'Yes');
		const textQuestion = localize('tds.vscode.question.tdsReplay.mustReimport',
		 'The filter informed is different from the last one. Do you wish to re-import using the current?');

		await vscode.window.showInformationMessage(textQuestion, textYes, textNo).then(clicked => {
			mustReimport = clicked === textYes;
		});
		return mustReimport;
	}

	updateLastFilterFile(config: DebugConfiguration, lastFilterFile :string , mustImport: boolean) {
		/*
			-i
			<includeList>
			-e
			<excludeList>
		*/
		if(mustImport) {
			let content = "-i\n"+config.includeSources+"\n"+"-e\n"+config.excludeSources;
			//Essa funcao cria o arquivo caso nao exista ou substitui o conteudo caso ja exista
			fs.writeFileSync(lastFilterFile, content, function (err) {
				if (err) {
					return console.log(err);
				}
			});
		}
	}
}