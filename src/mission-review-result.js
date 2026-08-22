const MAX_REVIEW_FINDINGS = 20
const MAX_REVIEW_SUMMARY_LENGTH = 4000
const MAX_REVIEW_TITLE_LENGTH = 200
const MAX_REVIEW_DETAIL_LENGTH = 4000
const MAX_REVIEW_PATHS = 20
const MAX_REVIEW_PATH_LENGTH = 500
const TRUNCATION_MARKER = '[conteúdo truncado pelo JZL]'

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim() !== ''
}

function truncate(value, maximumLength) {
  if (value.length <= maximumLength) {
    return value
  }

  const suffix = `\n${TRUNCATION_MARKER}`
  return `${value.slice(0, maximumLength - suffix.length)}${suffix}`
}

function validateFinding(finding, enforceLimits) {
  if (!isObject(finding)) {
    throw new Error('finding da revisão deve ser um objeto')
  }

  if (!['LOW', 'MEDIUM', 'HIGH'].includes(finding.severity)) {
    throw new Error('severity do finding da revisão não é suportada')
  }

  if (
    !isNonEmptyString(finding.title)
    || (enforceLimits && finding.title.length > MAX_REVIEW_TITLE_LENGTH)
  ) {
    throw new Error('title do finding da revisão é inválido')
  }

  if (
    !isNonEmptyString(finding.detail)
    || (enforceLimits && finding.detail.length > MAX_REVIEW_DETAIL_LENGTH)
  ) {
    throw new Error('detail do finding da revisão é inválido')
  }

  if (
    !Array.isArray(finding.paths)
    || (enforceLimits && finding.paths.length > MAX_REVIEW_PATHS)
  ) {
    throw new Error('paths do finding da revisão deve ser um array válido')
  }

  for (const path of finding.paths) {
    if (
      !isNonEmptyString(path)
      || (enforceLimits && path.length > MAX_REVIEW_PATH_LENGTH)
    ) {
      throw new Error('path do finding da revisão é inválido')
    }
  }
}

function validateReview(review, enforceLimits) {
  if (!isObject(review)) {
    throw new Error('resultado da revisão deve ser um objeto')
  }

  if (!['PASS', 'CONCERNS'].includes(review.verdict)) {
    throw new Error('verdict da revisão não é suportado')
  }

  if (
    !isNonEmptyString(review.summary)
    || (enforceLimits && review.summary.length > MAX_REVIEW_SUMMARY_LENGTH)
  ) {
    throw new Error('summary da revisão é inválido')
  }

  if (
    !Array.isArray(review.findings)
    || (enforceLimits && review.findings.length > MAX_REVIEW_FINDINGS)
  ) {
    throw new Error('findings da revisão deve ser um array')
  }

  if (
    (review.verdict === 'PASS' && review.findings.length !== 0)
    || (review.verdict === 'CONCERNS' && review.findings.length === 0)
  ) {
    throw new Error('mapeamento do resultado da revisão é incoerente')
  }

  for (const finding of review.findings) {
    validateFinding(finding, enforceLimits)
  }
}

export function validateMissionReviewResult(review) {
  validateReview(review, true)
  return review
}

export function parseMissionReviewResult(resultText) {
  if (typeof resultText !== 'string') {
    throw new Error('resultado da revisão deve ser uma string')
  }

  const trimmedResult = resultText.trim()

  if (trimmedResult === '') {
    throw new Error('resultado da revisão não pode ser vazio')
  }

  let parsed

  try {
    parsed = JSON.parse(trimmedResult)
  } catch {
    throw new Error('resultado da revisão não é JSON válido')
  }

  validateReview(parsed, false)

  const review = {
    verdict: parsed.verdict,
    summary: truncate(parsed.summary, MAX_REVIEW_SUMMARY_LENGTH),
    findings: parsed.findings.slice(0, MAX_REVIEW_FINDINGS).map((finding) => ({
      severity: finding.severity,
      title: truncate(finding.title, MAX_REVIEW_TITLE_LENGTH),
      detail: truncate(finding.detail, MAX_REVIEW_DETAIL_LENGTH),
      paths: finding.paths.slice(0, MAX_REVIEW_PATHS).map(
        (path) => truncate(path, MAX_REVIEW_PATH_LENGTH),
      ),
    })),
  }

  return validateMissionReviewResult(review)
}
