import type { GiveawayStatus, RuleType } from "@/types/giveaway";

export const appName = "Sorteio Auditável";

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
  required_phrase: "Palavra ou frase obrigatória",
  required_hashtag: "Hashtag obrigatória",
  min_mentions: "Quantidade mínima de marcações",
  require_mention: "Exigir ao menos uma marcação",
  forbidden_words: "Palavras proibidas",
  blocked_users: "Usuários excluídos",
  allowed_users: "Usuários permitidos",
  exclude_organizer: "Excluir perfil organizador",
  ignore_duplicates: "Ignorar comentários duplicados",
  min_length: "Ignorar comentários curtos",
};

export const captureMessages = {
  opening: "Acessando publicação...",
  loading: "Carregando comentários...",
  loadingMore: "Buscando mais comentários...",
  dedupe: "Removendo duplicidades...",
  saving: "Salvando comentários...",
  completed: "Captura concluída.",
  unavailable: "Não foi possível capturar comentários publicamente disponíveis desta postagem.",
};
