#include <stdio.h>
#include <string.h>

#include "../spectra_vdf_core.h"

static const char modulus_hex[] =
  "d0a80ef6e324476f2f29099c7c9064e2562684e1c6470c74b79811d37d487f9c"
  "ed83cdd7933f9680e3d84629183cc2077cadb35eb5d73e523a7137a03f9ce6fb"
  "d3ca46ecf7dd07781e8b5c3686bf97d7054a264a6e90cc22619df047c4b4713e"
  "e9a3f91620f9e26a28d14823db16262347065ab808727efebbd6b6618c2fc380"
  "57a57ab02a6289855357a3c55bdd19b843c5793ee9c1f997b804a3a5432865ef"
  "364667aebac969feda94aa908db44112c94b3cb4917a341f80945bd25faad00e"
  "87fc1561fdc2cc73ddb172befe2fb83033bd140b0c3f7f8348f3a8c1ca83a3a2"
  "19ea28469f2a64be087df3744981b5e821bbc7af12e74b937c2b4696c3225de3";

static const char group_hex[] =
  "3da1315b7b69a0f54208f7e07915d8ea633007e5453f8ee8e24f31aa8b7a3502"
  "c10a85933fba51b36318b9bf3c79b049d4c2ade9efb379663ff312dd7d6563e6"
  "2545ad3acc53ce820c8369fd2fb03cd9c199ace3fd44f29f49fdbe7abbd6845b"
  "80279cc604f48ce76fc2fb15ca6f437815a3a9f548e7c673666b77973902b184"
  "f0167f90c20c4a7271c5d0368b2a35a4e8cbfcdff2ffd987011e406a375c4c1e"
  "7a71e255e0f01b76b8d5831a48a06c1219c3f20dd7769d936d9f3fd60f00f71"
  "aa4c56fd94eef4c553e14af56728bccb146a6469867929d6a36994be4d833dce"
  "45bbf663c1e95efba3d0cad5fbf3f919cf47b64e0aac5389617a9dee3588dd363";

static const char expected_output_hex[] =
  "556c29587a92e4478847d71fbb96919611f5efe31ac4af7b2bca7b2f64a58cbb"
  "c1fe7ff3feff2373c5c7bfa5dace3c6b63bbc23603855544074eeb82fc5db2f1"
  "e25e0ef4f6ca98c4b8b5b680b3e2d1e8d0c2e9d959252387f595230ca9cbb0a"
  "9881877769b02d38925da4f035eb8a2bb3fe9d57d0b3bb8660a825e4bb1a14da"
  "82788a730fdfe1d0a318e22378f5c4449db72acefb3120e16a1e77c515bbe471"
  "d3dad6ceaf37afcaea5b0e928b760e187c944ef9c3d45146397568dad281b2ff"
  "ca664c798054a10b4d560b783132b89335a21628b17619f862a9d77ef4b887af"
  "e88df450414a1c5a92e441be899daa9aeb53f375f4f8d3ddcf913377bd0066c79";

static const char prime_hex[] = "8dafb2a5f82af7b991e51972b1c2d951";

static const char expected_proof_hex[] =
  "05efb5ac1d266d071f95a878ee12579473fa2c390177f4896daaf5a983e9605a"
  "62414d1bd9250b1bffb72fbdc9322ab8ca06a80e627b1395b5020a2689554d3c"
  "ce7740893fad13cf18ab24accc49a367162fa7dfc0f562cd1727d6b7caac2261"
  "a859be75c78bf79f19f0d7a43289fff74f4baa968527b7ff3d9056d0eccbb9b2"
  "8bb9bf7d35e0b3105d9fda2c33b6e662e0ec1c46455eeb5f452b4eebdc8175a"
  "de84d1783d45196dd93aaf905c4b63b53cf5fea45b1962bf1eb5df0539a70ac"
  "e3292d4dc11107b09491c5501de252426cbccc1eb8a90a0f45d06a51f1113889"
  "c692b35cdc4702bef3c4b04a5b319cda48e0b6e9c5992d593f92caf216aa774da7";

static int always_cancel(void *context) {
  (void)context;
  return 1;
}

int main(void) {
  char output[sizeof(expected_output_hex)];
  char proof[sizeof(expected_proof_hex)];
  spectra_vdf_status status = spectra_vdf_evaluate(
    modulus_hex,
    group_hex,
    192u,
    output,
    sizeof(output),
    NULL,
    NULL,
    NULL
  );
  if (status != SPECTRA_VDF_STATUS_OK || strcmp(output, expected_output_hex) != 0) {
    fprintf(stderr, "native evaluation vector mismatch\n");
    return 1;
  }
  status = spectra_vdf_prove(
    modulus_hex,
    group_hex,
    prime_hex,
    192u,
    proof,
    sizeof(proof),
    NULL,
    NULL,
    NULL
  );
  if (status != SPECTRA_VDF_STATUS_OK || strcmp(proof, expected_proof_hex) != 0) {
    fprintf(stderr, "native proof vector mismatch\n");
    return 1;
  }
  status = spectra_vdf_evaluate(
    modulus_hex,
    group_hex,
    192u,
    output,
    sizeof(output),
    NULL,
    always_cancel,
    NULL
  );
  if (status != SPECTRA_VDF_STATUS_CANCELLED) {
    fprintf(stderr, "native cancellation mismatch\n");
    return 1;
  }
  return 0;
}
