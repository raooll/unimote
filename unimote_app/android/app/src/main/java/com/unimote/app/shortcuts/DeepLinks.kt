package com.unimote.app.shortcuts

/** Pure helpers (JVM unit-tested) for the unimote:// links used by shortcuts and the Quick Settings tile. */
object DeepLinks {
  const val SCHEME = "unimote"
  const val MAX_SHORTCUTS = 4

  /** Scene ids are client-generated UUIDs; refuse anything else so a crafted link cannot smuggle odd characters in. */
  private val SAFE_ID = Regex("^[A-Za-z0-9-]{1,64}$")

  fun sceneUri(id: String): String? = if (SAFE_ID.matches(id)) "$SCHEME://scene/$id" else null

  /** Android allows a short label of ~10 characters on most launchers. */
  fun shortLabel(name: String): String = name.trim().let { if (it.length <= 12) it else it.take(11) + "…" }
  fun longLabel(name: String): String = name.trim().take(40)
}
