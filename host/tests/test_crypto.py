"""Signaling crypto against MyLAN's fixed vector (Tools/test_invite_v2.mjs) and envelope round trips."""
import unittest

from host import crypto


class CryptoTest(unittest.TestCase):
    def test_invite_v2_vector(self) -> None:
        keys = crypto.invite_keys("k7qm-4xrd-p2hw")
        self.assertEqual(keys.offer_key.hex(), "11ac8a124760b960a117c859b20cd0ee1d206478e9d4ec0b34928c4f2395d634")
        self.assertEqual(keys.answer_key.hex(), "a9bcc3446196ef0864c41aac7fc8d8616f57f29f00486186c1288baa7985a50a")
        self.assertEqual(keys.topic_offer, "mylan2-offer-08c80141ca1c0cd6723becc801bd044a")
        self.assertEqual(keys.topic_answer, "mylan2-answer-3bb82ff2fdfea75b11439933af7b0f56")

    def test_envelope_round_trip_and_wrong_key(self) -> None:
        key, other = bytes(32), bytes([1]) * 32
        sealed = crypto.seal({"type": "answer", "sdp": "v=0"}, key)
        self.assertEqual(crypto.unseal(sealed, key)["sdp"], "v=0")
        self.assertIsNone(crypto.unseal(sealed, other))
        self.assertIsNone(crypto.unseal("x" * 5000, key))

    def test_return_topics(self) -> None:
        a, b = crypto.return_topic("tok", "reconnect-offer"), crypto.return_topic("tok", "reconnect-answer")
        self.assertTrue(a.startswith("mylan-reconnect-offer-") and len(a) == len("mylan-reconnect-offer-") + 20)
        self.assertNotEqual(a, b)


if __name__ == "__main__":
    unittest.main()
