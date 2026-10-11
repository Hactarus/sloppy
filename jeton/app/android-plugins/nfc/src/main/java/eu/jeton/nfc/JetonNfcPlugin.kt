package eu.jeton.nfc

import android.app.Activity
import android.nfc.NdefMessage
import android.nfc.NdefRecord
import android.nfc.NfcAdapter
import android.nfc.Tag
import android.nfc.tech.Ndef
import android.nfc.tech.NdefFormatable
import android.nfc.tech.NfcA
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

/**
 * Jeton NFC plugin (ADR 0001 / 0008, docs/nfc-tags.md).
 *  - readTag():  reader mode, resolves with UID hex, raw NDEF message hex, chip type, NXP signature (NTAG21x).
 *  - writeUri(): writes ONE NDEF URI record (https:// -> identifier code 0x04), reads it back and optionally applies
 *                NTAG21x PWD_AUTH write protection (PROT=0, AUTH0=4, CFGLCK never set, no lock bits).
 * Reader mode (NfcAdapter.enableReaderMode) is used instead of foreground dispatch: no system tag dialog, no sound, no intent restart.
 * NOT yet exercised on hardware: validate with docs/nfc-tags.md section 5 step 2 (dry run on 5 tags) before the event.
 */
@CapacitorPlugin(name = "JetonNfc")
class JetonNfcPlugin : Plugin() {
    private var pending: PluginCall? = null
    private var writeUrl: String? = null
    private var protection: JSObject? = null

    private val flags = NfcAdapter.FLAG_READER_NFC_A or NfcAdapter.FLAG_READER_NFC_B or
        NfcAdapter.FLAG_READER_NFC_V or NfcAdapter.FLAG_READER_SKIP_NDEF_CHECK or NfcAdapter.FLAG_READER_NO_PLATFORM_SOUNDS

    private fun adapter(): NfcAdapter? = NfcAdapter.getDefaultAdapter(context)

    @PluginMethod
    fun isAvailable(call: PluginCall) {
        val a = adapter()
        call.resolve(JSObject().put("available", a != null).put("enabled", a?.isEnabled == true))
    }

    @PluginMethod
    fun readTag(call: PluginCall) = arm(call, null, null)

    @PluginMethod
    fun writeUri(call: PluginCall) {
        val url = call.getString("url")
        if (url == null || !url.startsWith("https://")) return call.reject("url must start with https://", "INVALID_URL")
        arm(call, url, call.getObject("protection"))
    }

    @PluginMethod
    fun cancel(call: PluginCall) {
        finish(null)?.reject("cancelled", "CANCELLED")
        call.resolve()
    }

    private fun arm(call: PluginCall, url: String?, prot: JSObject?) {
        val a = adapter() ?: return call.reject("NFC not available", "UNSUPPORTED")
        if (!a.isEnabled) return call.reject("NFC disabled", "UNSUPPORTED")
        finish(null)?.reject("superseded", "CANCELLED")
        pending = call
        writeUrl = url
        protection = prot
        a.enableReaderMode(activity, { tag -> onTag(tag) }, flags, null)
    }

    /** Disable reader mode and hand back the pending call (once). */
    @Synchronized
    private fun finish(@Suppress("UNUSED_PARAMETER") unused: Any?): PluginCall? {
        val c = pending
        pending = null
        try { adapter()?.disableReaderMode(activity as Activity) } catch (_: Exception) {}
        return c
    }

    private fun onTag(tag: Tag) {
        val call = finish(null) ?: return
        try {
            val out = if (writeUrl != null) write(tag, writeUrl!!, protection) else read(tag)
            call.resolve(out)
        } catch (e: Exception) {
            call.reject(e.message ?: "NFC error", if (writeUrl != null) "WRITE_FAILED" else "READ_FAILED")
        }
    }

    // ---------------------------------------------------------------- read

    private fun hex(b: ByteArray) = b.joinToString("") { "%02X".format(it) }
    private fun unhex(s: String) = ByteArray(s.length / 2) { s.substring(it * 2, it * 2 + 2).toInt(16).toByte() }

    private fun read(tag: Tag): JSObject {
        val o = JSObject().put("uid", hex(tag.id))
        val ndef = Ndef.get(tag)
        var ndefHex = ""
        if (ndef != null) {
            ndef.connect()
            ndefHex = ndef.ndefMessage?.toByteArray()?.let { hex(it) } ?: ""
            ndef.close()
        }
        o.put("ndefHex", ndefHex)
        NfcA.get(tag)?.let { a ->
            a.connect()
            try {
                val chip = ntagType(a)
                o.put("chipType", chip ?: "other")
                if (chip != null) readSignature(a)?.let { o.put("signature", hex(it)) }
            } finally { a.close() }
        }
        return o
    }

    /** GET_VERSION (0x60): byte 6 is the storage size code. Null when not an NTAG21x. */
    private fun ntagType(a: NfcA): String? = try {
        val v = a.transceive(byteArrayOf(0x60))
        if (v.size >= 8 && v[1].toInt() == 0x04 && v[2].toInt() == 0x02) when (v[6].toInt() and 0xff) {
            0x0F -> "ntag213"; 0x11 -> "ntag215"; 0x13 -> "ntag216"; else -> null
        } else null
    } catch (_: Exception) { reconnect(a); null }

    private fun reconnect(a: NfcA) { try { a.close() } catch (_: Exception) {}; a.connect() }

    /** READ_SIG (0x3C 0x00) -> 32-byte NXP originality signature. */
    private fun readSignature(a: NfcA): ByteArray? = try {
        a.transceive(byteArrayOf(0x3C, 0x00)).takeIf { it.size == 32 }
    } catch (_: Exception) { reconnect(a); null }

    // ---------------------------------------------------------------- write

    private fun write(tag: Tag, url: String, prot: JSObject?): JSObject {
        // NdefRecord.createUri compresses "https://" to identifier code 0x04, as required by docs/nfc-tags.md.
        val msg = NdefMessage(arrayOf(NdefRecord.createUri(url)))
        val ndef = Ndef.get(tag)
        if (ndef != null) {
            ndef.connect()
            try {
                if (!ndef.isWritable) throw IllegalStateException("tag is read-only")
                ndef.writeNdefMessage(msg)
            } finally { ndef.close() }
        } else {
            val f = NdefFormatable.get(tag) ?: throw IllegalStateException("tag does not support NDEF")
            f.connect()
            try { f.format(msg) } finally { f.close() }
        }
        // read back
        val back = Ndef.get(tag)
        var readbackOk = false
        if (back != null) {
            back.connect()
            readbackOk = back.ndefMessage?.toByteArray()?.contentEquals(msg.toByteArray()) == true
            back.close()
        }
        var protectedOk = false
        if (readbackOk && prot != null && prot.has("pwd") && prot.has("pack")) {
            protectedOk = applyProtection(tag, prot)
        }
        val o = read(tag)
        o.put("readbackOk", readbackOk).put("passwordProtected", protectedOk)
        return o
    }

    /**
     * NTAG21x protection, order per docs/nfc-tags.md section 3: PWD, PACK, CFG1 (PROT=0, AUTHLIM), CFG0 (AUTH0=4).
     * CFGLCK and all lock bits are never touched. Verified by (1) a write without auth must NAK, (2) PWD_AUTH returns PACK.
     */
    private fun applyProtection(tag: Tag, prot: JSObject): Boolean {
        val a = NfcA.get(tag) ?: return false
        a.connect()
        try {
            val chip = ntagType(a) ?: return false
            val cfg = when (chip) { "ntag213" -> 0x29; "ntag215" -> 0x83; else -> 0xE3 }
            val pwd = unhex(prot.getString("pwd")!!)
            val pack = unhex(prot.getString("pack")!!)
            val auth0 = (prot.optInt("auth0", 4)).toByte()
            val authlim = (prot.optInt("authlim", 7) and 0x07)
            // WRITE = 0xA2 <page> <4 bytes>
            a.transceive(byteArrayOf(0xA2.toByte(), (cfg + 2).toByte()) + pwd)
            a.transceive(byteArrayOf(0xA2.toByte(), (cfg + 3).toByte()) + pack + byteArrayOf(0, 0))
            val cfg1 = a.transceive(byteArrayOf(0x30, (cfg + 1).toByte())).copyOf(4)
            cfg1[0] = ((cfg1[0].toInt() and 0x38) or authlim).toByte() // PROT=0 (bit7), CFGLCK=0 (bit6), keep NFC_CNT bits, set AUTHLIM
            a.transceive(byteArrayOf(0xA2.toByte(), (cfg + 1).toByte()) + cfg1)
            val cfg0 = a.transceive(byteArrayOf(0x30, cfg.toByte())).copyOf(4)
            cfg0[3] = auth0
            a.transceive(byteArrayOf(0xA2.toByte(), cfg.toByte()) + cfg0)
            // verify 1: unauthenticated write to page 4 must fail
            reconnect(a)
            val before = a.transceive(byteArrayOf(0x30, 0x04)).copyOf(4)
            var rejected = false
            try { a.transceive(byteArrayOf(0xA2.toByte(), 0x04) + before) } catch (_: Exception) { rejected = true }
            reconnect(a)
            // verify 2: PWD_AUTH (0x1B) returns PACK
            val ack = a.transceive(byteArrayOf(0x1B) + pwd)
            return rejected && ack.size >= 2 && ack[0] == pack[0] && ack[1] == pack[1]
        } catch (_: Exception) {
            return false
        } finally { try { a.close() } catch (_: Exception) {} }
    }
}
