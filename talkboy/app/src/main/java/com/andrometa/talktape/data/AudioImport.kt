package com.andrometa.talktape.data

import android.content.Context
import android.media.AudioFormat
import android.media.MediaCodec
import android.media.MediaExtractor
import android.media.MediaFormat
import android.net.Uri
import android.provider.OpenableColumns
import com.andrometa.talktape.audio.Edits
import com.andrometa.talktape.audio.HearingRange
import com.andrometa.talktape.audio.Pcm
import java.io.IOException
import java.nio.ByteOrder

/** Any audio file Android can play (mp3, m4a, wav, ogg, flac, opus...) as a tape: 44.1 kHz, mono or stereo. */
object AudioImport {
    class TooLong : IOException()

    fun nameOf(ctx: Context, uri: Uri): String =
        ctx.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { c ->
            if (c.moveToFirst()) c.getString(0) else null
        }?.substringBeforeLast('.')?.trim()?.ifEmpty { null } ?: "Imported"

    /** Throws [TooLong] past [maxFrames] at 44.1 kHz, [IOException] for files with no audio. */
    fun decode(ctx: Context, uri: Uri, maxFrames: Int): Pcm {
        val ex = MediaExtractor()
        try {
            ex.setDataSource(ctx, uri, null)
            val track = (0 until ex.trackCount).firstOrNull {
                ex.getTrackFormat(it).getString(MediaFormat.KEY_MIME)?.startsWith("audio/") == true
            } ?: throw IOException("no audio track")
            ex.selectTrack(track)
            val inFmt = ex.getTrackFormat(track)
            val codec = MediaCodec.createDecoderByType(inFmt.getString(MediaFormat.KEY_MIME)!!)
            codec.configure(inFmt, null, null, 0)
            codec.start()
            var rate = inFmt.getInteger(MediaFormat.KEY_SAMPLE_RATE)
            var srcCh = inFmt.getInteger(MediaFormat.KEY_CHANNEL_COUNT)
            var isFloat = false
            val ch = if (srcCh >= 2) 2 else 1
            val limit = maxFrames.toLong() * rate / TapeStore.SAMPLE_RATE * ch
            if (inFmt.containsKey(MediaFormat.KEY_DURATION) &&
                inFmt.getLong(MediaFormat.KEY_DURATION) * rate / 1_000_000 * ch > limit) throw TooLong()
            // Sized from the stated length so long songs don't double their buffer at the end.
            val guess = if (inFmt.containsKey(MediaFormat.KEY_DURATION)) inFmt.getLong(MediaFormat.KEY_DURATION) * rate / 1_000_000 * ch else 0L
            var out = ShortArray((guess + rate * ch).coerceIn(1L shl 20, limit + rate * ch).toInt())
            var n = 0
            val info = MediaCodec.BufferInfo()
            var inputDone = false
            try {
                while (true) {
                    if (!inputDone) {
                        val i = codec.dequeueInputBuffer(10_000)
                        if (i >= 0) {
                            val size = ex.readSampleData(codec.getInputBuffer(i)!!, 0)
                            if (size < 0) { codec.queueInputBuffer(i, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM); inputDone = true }
                            else { codec.queueInputBuffer(i, 0, size, ex.sampleTime, 0); ex.advance() }
                        }
                    }
                    val o = codec.dequeueOutputBuffer(info, 10_000)
                    if (o == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) {
                        val f = codec.outputFormat
                        rate = f.getInteger(MediaFormat.KEY_SAMPLE_RATE)
                        srcCh = f.getInteger(MediaFormat.KEY_CHANNEL_COUNT)
                        isFloat = f.containsKey(MediaFormat.KEY_PCM_ENCODING) &&
                            f.getInteger(MediaFormat.KEY_PCM_ENCODING) == AudioFormat.ENCODING_PCM_FLOAT
                    } else if (o >= 0) {
                        val buf = codec.getOutputBuffer(o)!!.order(ByteOrder.LITTLE_ENDIAN)
                        buf.position(info.offset); buf.limit(info.offset + info.size)
                        val frames = info.size / ((if (isFloat) 4 else 2) * srcCh)
                        if (n + frames * ch > out.size) out = out.copyOf(maxOf(out.size * 2, n + frames * ch))
                        for (f in 0 until frames) {
                            // ponytail: more than 2 channels keeps the first two (front left / right).
                            for (k in 0 until srcCh) {
                                val v = if (isFloat) (buf.float.coerceIn(-1f, 1f) * 32767).toInt().toShort() else buf.short
                                if (k < ch) out[n + k] = v
                                if (srcCh == 1 && ch == 2) out[n + 1] = v
                            }
                            n += ch
                        }
                        codec.releaseOutputBuffer(o, false)
                        if (n > limit) throw TooLong()
                        if (info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0) break
                    }
                }
            } finally {
                codec.stop(); codec.release()
            }
            if (n == 0) throw IOException("no sound decoded")
            val pcm = Edits.resample(out.copyOf(n), ch, rate, TapeStore.SAMPLE_RATE)
            HearingRange(TapeStore.SAMPLE_RATE, ch).process(pcm, pcm.size / ch)
            return Pcm(pcm, ch)
        } finally {
            ex.release()
        }
    }
}
