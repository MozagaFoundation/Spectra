/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

package com.mozaga.exo

import android.util.Base64
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.security.MessageDigest
import java.security.SecureRandom
import java.util.Arrays
import java.util.Collections
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicInteger
import javax.crypto.Cipher
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec

class MediaCryptoModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        private const val KEY_LENGTH_BYTES = 32
        private const val NONCE_LENGTH_BYTES = 12
        private const val TAG_LENGTH_BITS = 128
        private const val MAX_FILE_BYTES = 50 * 1024 * 1024
        private const val SAFETY_NUMBER_ITERATIONS = 5200
    }

    private val executor = Executors.newSingleThreadExecutor()
    private val secureRandom = SecureRandom()
    private val cancelledJobIds = Collections.synchronizedSet(mutableSetOf<String>())
    private val cancelAllGeneration = AtomicInteger(0)

    override fun getName(): String = "MediaCryptoModule"

    @ReactMethod
    fun sha256(data: String, promise: Promise) {
        executor.execute {
            var bytes: ByteArray? = null
            try {
                bytes = Base64.decode(data, Base64.DEFAULT)
                val digest = MessageDigest.getInstance("SHA-256").digest(bytes)
                promise.resolve(digest.joinToString("") { byte -> "%02x".format(byte.toInt() and 0xff) })
            } catch (error: Throwable) {
                promise.reject("ERR_HASH", "SHA-256 failed", error)
            } finally {
                bytes?.let { Arrays.fill(it, 0) }
            }
        }
    }

    @ReactMethod
    fun encryptAesGcm(
        key: String,
        plaintext: String,
        associatedData: String?,
        jobId: String?,
        promise: Promise
    ) {
        val generation = cancelAllGeneration.get()
        executor.execute {
            var keyBytes: ByteArray? = null
            var plaintextBytes: ByteArray? = null
            var aadBytes: ByteArray? = null
            try {
                rejectIfCancelled(jobId, generation, promise)?.let { return@execute }
                keyBytes = Base64.decode(key, Base64.DEFAULT)
                if (keyBytes!!.size != KEY_LENGTH_BYTES) {
                    promise.reject("ERR_KEY", "AES key must be 32 bytes")
                    return@execute
                }

                plaintextBytes = Base64.decode(plaintext, Base64.DEFAULT)
                aadBytes = associatedData?.let { Base64.decode(it, Base64.DEFAULT) }
                val nonce = ByteArray(NONCE_LENGTH_BYTES)
                secureRandom.nextBytes(nonce)

                val cipher = Cipher.getInstance("AES/GCM/NoPadding")
                cipher.init(Cipher.ENCRYPT_MODE, SecretKeySpec(keyBytes, "AES"), GCMParameterSpec(TAG_LENGTH_BITS, nonce))
                aadBytes?.let { cipher.updateAAD(it) }
                val ciphertextWithTag = cipher.doFinal(plaintextBytes)
                rejectIfCancelled(jobId, generation, promise)?.let { return@execute }
                val tagLengthBytes = TAG_LENGTH_BITS / 8
                val ciphertext = ciphertextWithTag.copyOfRange(0, ciphertextWithTag.size - tagLengthBytes)
                val tag = ciphertextWithTag.copyOfRange(ciphertextWithTag.size - tagLengthBytes, ciphertextWithTag.size)

                val result = Arguments.createMap()
                result.putString("ciphertext", Base64.encodeToString(ciphertext, Base64.NO_WRAP))
                result.putString("nonce", Base64.encodeToString(nonce, Base64.NO_WRAP))
                result.putString("tag", Base64.encodeToString(tag, Base64.NO_WRAP))
                promise.resolve(result)
            } catch (error: Throwable) {
                promise.reject("ERR_ENCRYPT", "AES-GCM encryption failed", error)
            } finally {
                keyBytes?.let { Arrays.fill(it, 0) }
                plaintextBytes?.let { Arrays.fill(it, 0) }
                aadBytes?.let { Arrays.fill(it, 0) }
            }
        }
    }

    @ReactMethod
    fun decryptAesGcm(
        key: String,
        ciphertext: String,
        nonce: String,
        tag: String,
        associatedData: String?,
        jobId: String?,
        promise: Promise
    ) {
        val generation = cancelAllGeneration.get()
        executor.execute {
            var keyBytes: ByteArray? = null
            var ciphertextBytes: ByteArray? = null
            var tagBytes: ByteArray? = null
            var aadBytes: ByteArray? = null
            var plaintextBytes: ByteArray? = null
            try {
                rejectIfCancelled(jobId, generation, promise)?.let { return@execute }
                keyBytes = Base64.decode(key, Base64.DEFAULT)
                if (keyBytes!!.size != KEY_LENGTH_BYTES) {
                    promise.reject("ERR_KEY", "AES key must be 32 bytes")
                    return@execute
                }

                ciphertextBytes = Base64.decode(ciphertext, Base64.DEFAULT)
                val nonceBytes = Base64.decode(nonce, Base64.DEFAULT)
                tagBytes = Base64.decode(tag, Base64.DEFAULT)
                if (nonceBytes.size != NONCE_LENGTH_BYTES) {
                    promise.reject("ERR_DECRYPT", "AES-GCM nonce must be 12 bytes")
                    return@execute
                }
                if (tagBytes!!.size != TAG_LENGTH_BITS / 8) {
                    promise.reject("ERR_DECRYPT", "AES-GCM tag must be 16 bytes")
                    return@execute
                }

                aadBytes = associatedData?.let { Base64.decode(it, Base64.DEFAULT) }
                val ciphertextWithTag = ByteArray(ciphertextBytes!!.size + tagBytes.size)
                System.arraycopy(ciphertextBytes, 0, ciphertextWithTag, 0, ciphertextBytes.size)
                System.arraycopy(tagBytes, 0, ciphertextWithTag, ciphertextBytes.size, tagBytes.size)

                val cipher = Cipher.getInstance("AES/GCM/NoPadding")
                cipher.init(
                    Cipher.DECRYPT_MODE,
                    SecretKeySpec(keyBytes, "AES"),
                    GCMParameterSpec(TAG_LENGTH_BITS, nonceBytes)
                )
                aadBytes?.let { cipher.updateAAD(it) }
                plaintextBytes = cipher.doFinal(ciphertextWithTag)
                rejectIfCancelled(jobId, generation, promise)?.let { return@execute }
                promise.resolve(Base64.encodeToString(plaintextBytes, Base64.NO_WRAP))
            } catch (error: Throwable) {
                promise.reject("ERR_DECRYPT", "AES-GCM decryption failed", error)
            } finally {
                keyBytes?.let { Arrays.fill(it, 0) }
                ciphertextBytes?.let { Arrays.fill(it, 0) }
                tagBytes?.let { Arrays.fill(it, 0) }
                aadBytes?.let { Arrays.fill(it, 0) }
                plaintextBytes?.let { Arrays.fill(it, 0) }
            }
        }
    }

    @ReactMethod
    fun sha256File(path: String, promise: Promise) {
        executor.execute {
            try {
                val file = resolveSandboxedFile(path)
                throwIfTooLarge(file.length())
                val digest = MessageDigest.getInstance("SHA-256")
                FileInputStream(file).use { input ->
                    val buffer = ByteArray(1_048_576)
                    while (true) {
                        val read = input.read(buffer)
                        if (read <= 0) break
                        digest.update(buffer, 0, read)
                    }
                }
                promise.resolve(digest.digest().joinToString("") { byte -> "%02x".format(byte.toInt() and 0xff) })
            } catch (error: Throwable) {
                promise.reject("ERR_HASH", "SHA-256 file hash failed", error)
            }
        }
    }

    @ReactMethod
    fun encryptAesGcmFile(
        key: String,
        plaintextPath: String,
        destCiphertextPath: String,
        associatedData: String?,
        jobId: String?,
        promise: Promise
    ) {
        val generation = cancelAllGeneration.get()
        executor.execute {
            var keyBytes: ByteArray? = null
            var plaintextBytes: ByteArray? = null
            var aadBytes: ByteArray? = null
            try {
                rejectIfCancelled(jobId, generation, promise)?.let { return@execute }
                keyBytes = Base64.decode(key, Base64.DEFAULT)
                if (keyBytes!!.size != KEY_LENGTH_BYTES) {
                    promise.reject("ERR_KEY", "AES key must be 32 bytes")
                    return@execute
                }
                val source = resolveSandboxedFile(plaintextPath)
                val dest = resolveSandboxedFile(destCiphertextPath)
                throwIfTooLarge(source.length())
                plaintextBytes = source.readBytes()
                aadBytes = associatedData?.let { Base64.decode(it, Base64.DEFAULT) }
                val nonce = ByteArray(NONCE_LENGTH_BYTES)
                secureRandom.nextBytes(nonce)
                val cipher = Cipher.getInstance("AES/GCM/NoPadding")
                cipher.init(Cipher.ENCRYPT_MODE, SecretKeySpec(keyBytes, "AES"), GCMParameterSpec(TAG_LENGTH_BITS, nonce))
                aadBytes?.let { cipher.updateAAD(it) }
                val ciphertextWithTag = cipher.doFinal(plaintextBytes)
                rejectIfCancelled(jobId, generation, promise)?.let { return@execute }
                val tagLengthBytes = TAG_LENGTH_BITS / 8
                val ciphertext = ciphertextWithTag.copyOfRange(0, ciphertextWithTag.size - tagLengthBytes)
                val tag = ciphertextWithTag.copyOfRange(ciphertextWithTag.size - tagLengthBytes, ciphertextWithTag.size)
                dest.parentFile?.mkdirs()
                dest.writeBytes(ciphertext)
                val result = Arguments.createMap()
                result.putString("nonce", Base64.encodeToString(nonce, Base64.NO_WRAP))
                result.putString("tag", Base64.encodeToString(tag, Base64.NO_WRAP))
                result.putInt("ciphertextBytes", ciphertext.size)
                promise.resolve(result)
            } catch (error: Throwable) {
                promise.reject("ERR_ENCRYPT", "AES-GCM file encryption failed", error)
            } finally {
                keyBytes?.let { Arrays.fill(it, 0) }
                plaintextBytes?.let { Arrays.fill(it, 0) }
                aadBytes?.let { Arrays.fill(it, 0) }
            }
        }
    }

    @ReactMethod
    fun decryptAesGcmFile(
        key: String,
        ciphertextPath: String,
        destPlaintextPath: String,
        nonce: String,
        tag: String,
        associatedData: String?,
        jobId: String?,
        promise: Promise
    ) {
        val generation = cancelAllGeneration.get()
        executor.execute {
            var keyBytes: ByteArray? = null
            var ciphertextBytes: ByteArray? = null
            var tagBytes: ByteArray? = null
            var aadBytes: ByteArray? = null
            var plaintextBytes: ByteArray? = null
            try {
                rejectIfCancelled(jobId, generation, promise)?.let { return@execute }
                keyBytes = Base64.decode(key, Base64.DEFAULT)
                if (keyBytes!!.size != KEY_LENGTH_BYTES) {
                    promise.reject("ERR_KEY", "AES key must be 32 bytes")
                    return@execute
                }
                val source = resolveSandboxedFile(ciphertextPath)
                val dest = resolveSandboxedFile(destPlaintextPath)
                throwIfTooLarge(source.length() + TAG_LENGTH_BITS / 8)
                ciphertextBytes = source.readBytes()
                val nonceBytes = Base64.decode(nonce, Base64.DEFAULT)
                tagBytes = Base64.decode(tag, Base64.DEFAULT)
                if (nonceBytes.size != NONCE_LENGTH_BYTES || tagBytes!!.size != TAG_LENGTH_BITS / 8) {
                    promise.reject("ERR_DECRYPT", "Invalid AES-GCM payload")
                    return@execute
                }
                aadBytes = associatedData?.let { Base64.decode(it, Base64.DEFAULT) }
                val ciphertextWithTag = ByteArray(ciphertextBytes!!.size + tagBytes.size)
                System.arraycopy(ciphertextBytes, 0, ciphertextWithTag, 0, ciphertextBytes.size)
                System.arraycopy(tagBytes, 0, ciphertextWithTag, ciphertextBytes.size, tagBytes.size)
                val cipher = Cipher.getInstance("AES/GCM/NoPadding")
                cipher.init(Cipher.DECRYPT_MODE, SecretKeySpec(keyBytes, "AES"), GCMParameterSpec(TAG_LENGTH_BITS, nonceBytes))
                aadBytes?.let { cipher.updateAAD(it) }
                plaintextBytes = cipher.doFinal(ciphertextWithTag)
                rejectIfCancelled(jobId, generation, promise)?.let { return@execute }
                dest.parentFile?.mkdirs()
                dest.writeBytes(plaintextBytes)
                promise.resolve(dest.path)
            } catch (error: Throwable) {
                promise.reject("ERR_DECRYPT", "AES-GCM file decryption failed", error)
            } finally {
                keyBytes?.let { Arrays.fill(it, 0) }
                ciphertextBytes?.let { Arrays.fill(it, 0) }
                tagBytes?.let { Arrays.fill(it, 0) }
                aadBytes?.let { Arrays.fill(it, 0) }
                plaintextBytes?.let { Arrays.fill(it, 0) }
            }
        }
    }

    @ReactMethod
    fun writeMediaBlob(
        headerJson: String,
        ciphertextPath: String,
        nonce: String,
        tag: String,
        destPath: String,
        promise: Promise
    ) {
        executor.execute {
            try {
                val source = resolveSandboxedFile(ciphertextPath)
                val dest = resolveSandboxedFile(destPath)
                throwIfTooLarge(source.length())
                val ciphertextB64 = Base64.encodeToString(source.readBytes(), Base64.NO_WRAP)
                val content = "{\"ciphertext\":\"$ciphertextB64\",\"nonce\":\"$nonce\",\"tag\":\"$tag\"}".toByteArray(Charsets.UTF_8)
                val header = headerJson.toByteArray(Charsets.UTF_8)
                if (header.isEmpty() || header.size > 64 * 1024) {
                    promise.reject("ERR_BLOB", "Invalid media blob header")
                    return@execute
                }
                dest.parentFile?.mkdirs()
                FileOutputStream(dest).use { output ->
                    val length = ByteBuffer.allocate(4).order(ByteOrder.LITTLE_ENDIAN).putInt(header.size).array()
                    output.write(length)
                    output.write(header)
                    output.write(content)
                }
                val result = Arguments.createMap()
                result.putInt("bytes", 4 + header.size + content.size)
                promise.resolve(result)
            } catch (error: Throwable) {
                promise.reject("ERR_BLOB", "Media blob write failed", error)
            }
        }
    }

    @ReactMethod
    fun decryptMediaBlobFile(
        key: String,
        blobPath: String,
        destPlaintextPath: String,
        associatedData: String?,
        jobId: String?,
        promise: Promise
    ) {
        val generation = cancelAllGeneration.get()
        executor.execute {
            var keyBytes: ByteArray? = null
            var plaintextBytes: ByteArray? = null
            var aadBytes: ByteArray? = null
            try {
                rejectIfCancelled(jobId, generation, promise)?.let { return@execute }
                keyBytes = Base64.decode(key, Base64.DEFAULT)
                if (keyBytes!!.size != KEY_LENGTH_BYTES) {
                    promise.reject("ERR_KEY", "AES key must be 32 bytes")
                    return@execute
                }
                val source = resolveSandboxedFile(blobPath)
                val dest = resolveSandboxedFile(destPlaintextPath)
                throwIfTooLarge(source.length())
                val blob = source.readBytes()
                if (blob.size < 4) {
                    promise.reject("ERR_DECRYPT", "Malformed encrypted media blob")
                    return@execute
                }
                val headerLength = ByteBuffer.wrap(blob, 0, 4).order(ByteOrder.LITTLE_ENDIAN).int
                if (headerLength <= 0 || headerLength > 64 * 1024 || 4 + headerLength > blob.size) {
                    promise.reject("ERR_DECRYPT", "Malformed encrypted media blob")
                    return@execute
                }
                val headerJson = String(blob, 4, headerLength, Charsets.UTF_8)
                val header = JSONObject(headerJson)
                val contentBytes = blob.copyOfRange(4 + headerLength, blob.size)
                if (contentBytes.isEmpty()) {
                    promise.reject("ERR_DECRYPT", "Malformed encrypted media blob")
                    return@execute
                }
                aadBytes = associatedData?.let { Base64.decode(it, Base64.DEFAULT) } ?: ByteArray(0)
                plaintextBytes = if (header.optBoolean("isChunked")) {
                    decryptChunks(keyBytes, JSONArray(String(contentBytes, Charsets.UTF_8)), aadBytes)
                } else {
                    val payload = JSONObject(String(contentBytes, Charsets.UTF_8))
                    openAes(
                        keyBytes,
                        Base64.decode(payload.getString("ciphertext"), Base64.DEFAULT),
                        Base64.decode(payload.getString("nonce"), Base64.DEFAULT),
                        Base64.decode(payload.getString("tag"), Base64.DEFAULT),
                        aadBytes,
                    )
                }
                rejectIfCancelled(jobId, generation, promise)?.let { return@execute }
                dest.parentFile?.mkdirs()
                dest.writeBytes(plaintextBytes!!)
                val result = Arguments.createMap()
                result.putString("headerJson", headerJson)
                result.putInt("plaintextBytes", plaintextBytes.size)
                promise.resolve(result)
            } catch (error: Throwable) {
                promise.reject("ERR_DECRYPT", "Media blob decryption failed", error)
            } finally {
                keyBytes?.let { Arrays.fill(it, 0) }
                plaintextBytes?.let { Arrays.fill(it, 0) }
                aadBytes?.let { Arrays.fill(it, 0) }
            }
        }
    }

    @ReactMethod
    fun deriveSafetyNumberFingerprint(
        keyMaterial: String,
        identityId: String,
        version: Int,
        promise: Promise
    ) {
        executor.execute {
            try {
                if (version < 0 || version > 255) {
                    promise.reject("ERR_HASH", "Invalid safety-number material")
                    return@execute
                }
                val material = Base64.decode(keyMaterial, Base64.DEFAULT)
                val identityBytes = identityId.toByteArray(Charsets.UTF_8)
                var hash = ByteArray(1 + material.size + identityBytes.size)
                hash[0] = version.toByte()
                System.arraycopy(material, 0, hash, 1, material.size)
                System.arraycopy(identityBytes, 0, hash, 1 + material.size, identityBytes.size)
                val digest = MessageDigest.getInstance("SHA-256")
                repeat(SAFETY_NUMBER_ITERATIONS) {
                    digest.reset()
                    digest.update(hash)
                    digest.update(material)
                    hash = digest.digest()
                }
                promise.resolve(hash.joinToString("") { byte -> "%02x".format(byte.toInt() and 0xff) })
            } catch (error: Throwable) {
                promise.reject("ERR_HASH", "Safety-number fingerprint failed", error)
            }
        }
    }

    @ReactMethod
    fun cancel(jobId: String) {
        cancelledJobIds.add(jobId)
    }

    @ReactMethod
    fun cancelAll() {
        cancelAllGeneration.incrementAndGet()
        cancelledJobIds.clear()
    }

    private fun rejectIfCancelled(jobId: String?, generation: Int, promise: Promise): Unit? {
        if (
            generation != cancelAllGeneration.get()
            || (!jobId.isNullOrEmpty() && cancelledJobIds.contains(jobId))
        ) {
            promise.reject("ERR_CANCELLED", "AES-GCM job cancelled")
            return Unit
        }
        return null
    }

    private fun resolveSandboxedFile(path: String): File {
        val stripped = if (path.startsWith("file://")) {
            java.net.URI(path).path ?: path.removePrefix("file://")
        } else {
            path
        }
        val file = File(stripped).canonicalFile
        val roots = listOfNotNull(
            reactApplicationContext.cacheDir.canonicalFile,
            reactApplicationContext.filesDir.canonicalFile,
            reactApplicationContext.codeCacheDir.canonicalFile,
            reactApplicationContext.noBackupFilesDir.canonicalFile,
        )
        val allowed = roots.any { root -> file == root || file.path.startsWith(root.path + File.separator) }
        if (!allowed) {
            throw IllegalArgumentException("Path is outside the app sandbox")
        }
        return file
    }

    private fun throwIfTooLarge(size: Long) {
        if (size < 0 || size > MAX_FILE_BYTES) {
            throw IllegalArgumentException("Media exceeds 50 MiB")
        }
    }

    private fun openAes(
        keyBytes: ByteArray,
        ciphertext: ByteArray,
        nonce: ByteArray,
        tag: ByteArray,
        aad: ByteArray,
    ): ByteArray {
        if (nonce.size != NONCE_LENGTH_BYTES || tag.size != TAG_LENGTH_BITS / 8) {
            throw IllegalArgumentException("Invalid AES-GCM payload")
        }
        val ciphertextWithTag = ByteArray(ciphertext.size + tag.size)
        System.arraycopy(ciphertext, 0, ciphertextWithTag, 0, ciphertext.size)
        System.arraycopy(tag, 0, ciphertextWithTag, ciphertext.size, tag.size)
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.DECRYPT_MODE, SecretKeySpec(keyBytes, "AES"), GCMParameterSpec(TAG_LENGTH_BITS, nonce))
        if (aad.isNotEmpty()) {
            cipher.updateAAD(aad)
        }
        return cipher.doFinal(ciphertextWithTag)
    }

    private fun decryptChunks(keyBytes: ByteArray, chunks: JSONArray, associatedData: ByteArray): ByteArray {
        val sorted = (0 until chunks.length()).map { chunks.getJSONObject(it) }
            .sortedBy { it.getInt("index") }
        val pieces = ArrayList<ByteArray>(sorted.size)
        var total = 0
        for ((expected, chunk) in sorted.withIndex()) {
            if (chunk.getInt("index") != expected) {
                throw IllegalArgumentException("Missing chunk at index $expected")
            }
            val originalSize = chunk.getInt("originalSize")
            val isFinal = chunk.getBoolean("isFinal")
            val chunkAad = ByteArray(associatedData.size + 9)
            System.arraycopy(associatedData, 0, chunkAad, 0, associatedData.size)
            ByteBuffer.wrap(chunkAad, associatedData.size, 4).order(ByteOrder.LITTLE_ENDIAN).putInt(expected)
            ByteBuffer.wrap(chunkAad, associatedData.size + 4, 4).order(ByteOrder.LITTLE_ENDIAN).putInt(originalSize)
            chunkAad[associatedData.size + 8] = if (isFinal) 1 else 0
            val piece = openAes(
                keyBytes,
                Base64.decode(chunk.getString("ciphertext"), Base64.DEFAULT),
                Base64.decode(chunk.getString("nonce"), Base64.DEFAULT),
                Base64.decode(chunk.getString("tag"), Base64.DEFAULT),
                chunkAad,
            )
            if (piece.size != originalSize) {
                throw IllegalArgumentException("Chunk original size mismatch")
            }
            pieces.add(piece)
            total += piece.size
        }
        val plaintext = ByteArray(total)
        var offset = 0
        for (piece in pieces) {
            System.arraycopy(piece, 0, plaintext, offset, piece.size)
            offset += piece.size
        }
        return plaintext
    }
}
