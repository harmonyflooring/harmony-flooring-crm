/* Price sheet layout for the Bookkeeping page: titles, labels and rate paths only.
   The numbers and notes come from the locked billing_manual table. Carpet rows are built from the carpet list. */
window.HarmonyLayout = {
 "sections": [
  {
   "title": "Vinyl",
   "cols": [
    "Charge customer",
    "Pay installer"
   ],
   "rows": [
    [
     "Vinyl install (standard)",
     "vinyl.charge",
     "vinyl.pay"
    ],
    [
     "Glue-down 20 mil",
     "vinyl.glueDown20mil",
     "vinyl.pay"
    ],
    [
     "Special design",
     "vinyl.charge",
     "=TBD per job"
    ],
    [
     "Luan (each)",
     "luanCharge",
     "luanPay"
    ]
   ]
  },
  {
   "title": "Rip up & haul away",
   "cols": [
    "Charge — investor",
    "Charge — residential",
    "Pay installer"
   ],
   "rows": [
    [
     "Carpet rip up & haul away",
     "ripup.carpetHaul.investor",
     "ripup.carpetHaul.residential",
     "ripup.carpetHaul.pay"
    ],
    [
     "Carpet rip up only (leave onsite)",
     "ripup.carpetOnsite.charge",
     "ripup.carpetOnsite.charge",
     "ripup.carpetOnsite.pay"
    ],
    [
     "Haul away only",
     "ripup.haulOnly.charge",
     "ripup.haulOnly.charge",
     "=Do not pay"
    ],
    [
     "Vinyl / click / laminate (per sqf)",
     "ripup.vinyl.charge",
     "ripup.vinyl.charge",
     "ripup.vinyl.pay"
    ],
    [
     "VCT (per sqf)",
     "=Per job",
     "=Per job",
     "ripup.vct.pay"
    ],
    [
     "Carpet tile (per yd)",
     "=Per job",
     "=Per job",
     "ripup.carpetTile.pay"
    ]
   ]
  },
  {
   "title": "Steps",
   "cols": [
    "Charge customer",
    "Pay installer"
   ],
   "rows": [
    [
     "Box steps (per flight)",
     "steps.box.charge",
     "steps.box.pay"
    ],
    [
     "Mixed flight / \"X cap\" (per flight)",
     "steps.mixed.charge",
     "steps.mixed.pay"
    ],
    [
     "Full cap (per flight)",
     "steps.cap.charge",
     "steps.cap.pay"
    ],
    [
     "Add when job has rip-up (folded in)",
     "steps.ripupAddCharge",
     "=No extra pay"
    ],
    [
     "Birdcage (folded in)",
     "steps.birdcage.charge",
     "steps.birdcage.pay"
    ],
    [
     "Floating steps (per step)",
     "=Per job",
     "steps.floatingPerStep"
    ],
    [
     "Vinyl steps (per step)",
     "=Per job",
     "steps.vinylPerStep"
    ],
    [
     "Vinyl steps with rip-up (per step)",
     "=Per job",
     "steps.vinylPerStepRipup"
    ],
    [
     "Flat rate small job — regular",
     "=Per job",
     "steps.flatSmall.regular"
    ],
    [
     "Flat rate small job — difficult",
     "=Per job",
     "steps.flatSmall.difficult"
    ]
   ]
  },
  {
   "title": "Stringers",
   "cols": [
    "Charge customer",
    "Pay installer"
   ],
   "rows": [
    [
     "Stringers (each)",
     "stringers.charge",
     "stringers.pay"
    ],
    [
     "Residential with rip-up (each)",
     "stringers.residentialRipup",
     "stringers.pay"
    ]
   ]
  },
  {
   "title": "Shoe molding & transitions",
   "cols": [
    "Charge — investor",
    "Charge — residential",
    "Pay installer"
   ],
   "rows": [
    [
     "Shoe molding (per lf)",
     "shoe.investor",
     "shoe.residential",
     "shoe.pay"
    ],
    [
     "Metal transition",
     "transitions.metal",
     "transitions.metal",
     "=Never pay"
    ],
    [
     "Rubber transition",
     "transitions.rubber",
     "transitions.rubber",
     "=Never pay"
    ],
    [
     "Matching transition",
     "transitions.matching",
     "transitions.matching",
     "=Never pay"
    ]
   ]
  },
  {
   "title": "Cove base",
   "cols": [
    "Charge customer",
    "Pay installer"
   ],
   "rows": [
    [
     "Standard (per ft)",
     "cove.standard",
     "cove.pay"
    ],
    [
     "Special order (per ft)",
     "cove.special",
     "cove.pay"
    ]
   ]
  },
  {
   "title": "Prep / patch",
   "cols": [
    "Charge customer",
    "Pay installer"
   ],
   "rows": [
    [
     "Patch / prep (per bag)",
     "=Per bag or flat",
     "patchPayPerBag"
    ],
    [
     "Max patch cost per sqf (sanity check)",
     "patchMaxPerSqf",
     null
    ]
   ]
  },
  {
   "title": "Other",
   "cols": [
    "Charge customer",
    "Pay installer"
   ],
   "rows": [
    [
     "Toilet / appliance removal",
     "appliance.charge",
     "appliance.pay"
    ],
    [
     "Appliance — removed, not reinstalled",
     null,
     "appliance.payNotReinstalled"
    ],
    [
     "Gas (default)",
     "=Never charge",
     "gasDefault"
    ],
    [
     "Repair (default pay — always ask Israel)",
     "=Per job",
     "repairDefaultPay"
    ],
    [
     "Minimum installer pay per job (gas not counted)",
     null,
     "minInstallerPay"
    ]
   ]
  }
 ]
};
