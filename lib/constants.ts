import type { GiveawayStatus, RuleType } from "@/types/giveaway";

export const appName = "Sorteio Auditavel";

export const statusLabels: Record<GiveawayStatus, string> = {
  draft: "Rascunho",
  ready_to_capture: "Pronto para captura",
  capturing: "Capturando",
  captured: "Capturado",
  validating: "Validando",
  ready_to_draw: "Pronto para sorteio",
  drawn: "Sorteado",
  capture_failed: "Falha na captura",
};

export const statusTone: Record<GiveawayStatus, "default" | "secondary" | "destructive" | "outline"> = {
  draft: "outline",
  ready_to_capture: "secondary",
  capturing: "default",
  captured: "secondary",
  validating: "default",
  ready_to_draw: "secondary",
  drawn: "default",
  capture_failed: "destructive",
};

export const ruleLabels: Record<RuleType, string> = {
  required_phrase: "Palavra ou frase obrigatoria",
  required_hashtag: "Hashtag obrigatoria",
  min_mentions: "Quantidade minima de marcacoes",
  require_mention: "Exigir ao menos uma marcacao",
  forbidden_words: "Palavras proibidas",
  blocked_users: "Usuarios excluidos",
  allowed_users: "Usuarios permitidos",
  exclude_organizer: "Excluir perfil organizador",
  ignore_duplicates: "Ignorar comentarios duplicados",
  min_length: "Ignorar comentarios curtos",
};

export const captureMessages = {
  opening: "Acessando publicacao...",
  loading: "Carregando comentarios...",
  loadingMore: "Buscando mais comentarios...",
  dedupe: "Removendo duplicidades...",
  saving: "Salvando comentarios...",
  completed: "Captura concluida.",
  unavailable: "Nao foi possivel capturar comentarios publicamente disponiveis desta postagem.",
};
