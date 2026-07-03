let helpCommandMention = '`/help`';

export function setHelpCommandMention(commandId) {
  helpCommandMention = `</help:${commandId}>`;
}

export function getHelpCommandMention() {
  return helpCommandMention;
}
