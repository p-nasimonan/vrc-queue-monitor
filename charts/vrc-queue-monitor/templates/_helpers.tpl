{{/*
Chart の共通ラベル
*/}}
{{- define "vrc-queue-monitor.labels" -}}
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version | trunc 63 | trimSuffix "-" }}
{{ include "vrc-queue-monitor.selectorLabels" . }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- with .Values.commonLabels }}
{{ toYaml . }}
{{- end }}
{{- end }}

{{/*
セレクターラベル
*/}}
{{- define "vrc-queue-monitor.selectorLabels" -}}
app.kubernetes.io/name: {{ .Chart.Name }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
イメージ参照（name を指定して呼び出す）
使用例: {{ include "vrc-queue-monitor.image" (dict "root" . "name" .Values.frontend.image.name) }}
*/}}
{{- define "vrc-queue-monitor.image" -}}
{{- $tag := .root.Values.image.tag | default .root.Chart.AppVersion -}}
{{ printf "%s/%s/%s:%s" .root.Values.image.registry .root.Values.image.repository .name $tag }}
{{- end }}

{{/*
Secret 名
*/}}
{{- define "vrc-queue-monitor.secretName" -}}
{{- if .Values.secrets.existingSecret -}}
{{ .Values.secrets.existingSecret }}
{{- else -}}
{{ .Release.Name }}-secrets
{{- end }}
{{- end }}

{{/*
ConfigMap 名 (コンポーネント別)
*/}}
{{- define "vrc-queue-monitor.configmapName" -}}
{{ .Release.Name }}-{{ .component }}-config
{{- end }}
